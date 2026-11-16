import { Hono } from 'hono';
import { Env, SubdomainRow } from '../types';
import { detectPlatformFromUrl } from '../services/xhs-parser';
import { sendMail } from '../services/mail';

export const publicRoutes = new Hono<{ Bindings: Env }>();

const BUILTIN_RESERVED = new Set([
  'www', 'api', 'admin', 'app', 'mail', 'smtp', 'imap', 'pop', 'mx', 'ns1', 'ns2',
  'cdn', 'static', 'assets', 'img', 'docs', 'blog', 'status', 'help', 'support',
  'dev', 'test', 'staging', 'auth', 'login', 'account', 'pay', 'billing', 'official',
  'vibe', 'show', 'root', 'dashboard', 'console', 'security', 'abuse', 'edge', 'proxy',
  'free'
]);

export function sanitizePrefix(raw: string): string {
  return (raw || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
}

export function validatePrefixFormat(p: string): { valid: boolean; state?: string; msg?: string } {
  if (!p) return { valid: false, state: 'empty' };
  if (p.length < 3) return { valid: false, state: 'hint', msg: '至少需要 3 个字符' };
  if (p.length > 30) return { valid: false, state: 'invalid', msg: '最多不超过 30 个字符' };
  if (p.startsWith('-') || p.endsWith('-')) {
    return { valid: false, state: 'invalid', msg: '不能以连字符开头或结尾' };
  }
  if (p.includes('--')) {
    return { valid: false, state: 'invalid', msg: '不能包含连续的连字符' };
  }
  return { valid: true };
}

async function isReservedWord(env: Env, p: string): Promise<boolean> {
  if (BUILTIN_RESERVED.has(p)) return true;
  try {
    const row = await env.DB.prepare('SELECT word FROM reserved_words WHERE word = ? LIMIT 1')
      .bind(p)
      .first();
    return Boolean(row);
  } catch {
    return false;
  }
}

async function buildSuggestions(env: Env, p: string): Promise<string[]> {
  const base = p.slice(0, 24);
  const candidates = [`${base}-ai`, `my${base}`, `${base}-app`, `${base}lab`, `${base}-vibe`]
    .filter((c) => c.length >= 3 && c.length <= 30 && !BUILTIN_RESERVED.has(c));

  if (candidates.length === 0) return [];
  try {
    const placeholders = candidates.map(() => '?').join(',');
    const takenRows = await env.DB.prepare(
      `SELECT prefix FROM subdomains
       WHERE prefix IN (${placeholders})
         AND (status IN ('ACTIVE', 'PENDING_REVIEW')
              OR (status = 'SOFT_LOCKED' AND datetime(lock_expires_at) > datetime('now')))`
    )
      .bind(...candidates)
      .all<{ prefix: string }>();
    const takenSet = new Set((takenRows.results || []).map((r) => r.prefix));
    return candidates.filter((c) => !takenSet.has(c)).slice(0, 3);
  } catch {
    return candidates.slice(0, 3);
  }
}

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`vibe-salt-2026:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 1. 前缀实时查重接口
 * GET /api/prefix/check?prefix=notes&token=vc_xxx
 */
publicRoutes.get('/prefix/check', async (c) => {
  const raw = c.req.query('prefix') || '';
  const token = c.req.query('token') || '';
  const p = sanitizePrefix(raw);

  const fmt = validatePrefixFormat(p);
  if (!fmt.valid) {
    return c.json({ prefix: p, state: fmt.state, msg: fmt.msg, suggestions: [] });
  }

  if (await isReservedWord(c.env, p)) {
    return c.json({ prefix: p, state: 'reserved', suggestions: [] });
  }

  // 惰性清理该前缀已过期的 SOFT_LOCKED 记录
  await c.env.DB.prepare(
    `DELETE FROM subdomains
     WHERE prefix = ?
       AND status = 'SOFT_LOCKED'
       AND lock_expires_at IS NOT NULL
       AND datetime(lock_expires_at) <= datetime('now')`
  )
    .bind(p)
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM subdomains WHERE prefix = ? LIMIT 1')
    .bind(p)
    .first<SubdomainRow>();

  if (!row || row.status === 'REJECTED' || row.status === 'REVOKED') {
    return c.json({ prefix: p, state: 'available', suggestions: [] });
  }

  if (row.status === 'SOFT_LOCKED') {
    // 如果是本人会话锁定的，仍然返回 available
    if (token && row.client_token && token === row.client_token) {
      return c.json({ prefix: p, state: 'available', self_locked: true, suggestions: [] });
    }
    const expMs = row.lock_expires_at ? new Date(row.lock_expires_at + 'Z').getTime() : Date.now();
    const remainMin = Math.max(1, Math.ceil((expMs - Date.now()) / 60_000));
    const suggestions = await buildSuggestions(c.env, p);
    return c.json({
      prefix: p,
      state: 'locked',
      lock_remaining_minutes: remainMin,
      suggestions
    });
  }

  // ACTIVE 或 PENDING_REVIEW
  const suggestions = await buildSuggestions(c.env, p);
  return c.json({
    prefix: p,
    state: 'taken',
    owner: row.author_name || '@VibeCoder',
    suggestions
  });
});

/**
 * 2. 点击「复制口令并去小红书留言」触发 2 小时软锁号
 * POST /api/prefix/soft-lock
 */
publicRoutes.post('/prefix/soft-lock', async (c) => {
  const body = await c.req.json<{
    prefix?: string;
    title?: string;
    origin_url?: string;
    token?: string;
  }>();

  const p = sanitizePrefix(body.prefix || '');
  const fmt = validatePrefixFormat(p);
  if (!fmt.valid) {
    return c.json({ ok: false, error: fmt.msg || '前缀格式不合法' }, 400);
  }
  if (await isReservedWord(c.env, p)) {
    return c.json({ ok: false, error: '该前缀为系统保留字' }, 400);
  }

  const token = (body.token || '').trim().slice(0, 64);
  const title = (body.title || '').trim().slice(0, 30) || '我的 AI 编程作品';
  const origin_url = (body.origin_url || '').trim().slice(0, 255);
  const platform = detectPlatformFromUrl(origin_url);
  const ip = c.req.header('CF-Connecting-IP') || '127.0.0.1';
  const ipHash = await hashIp(ip);

  // 清理已过期的锁号
  await c.env.DB.prepare(
    `DELETE FROM subdomains
     WHERE status = 'SOFT_LOCKED'
       AND lock_expires_at IS NOT NULL
       AND datetime(lock_expires_at) <= datetime('now')`
  ).run();

  const existing = await c.env.DB.prepare('SELECT * FROM subdomains WHERE prefix = ? LIMIT 1')
    .bind(p)
    .first<SubdomainRow>();

  if (existing) {
    if (existing.status === 'ACTIVE' || existing.status === 'PENDING_REVIEW') {
      return c.json({ ok: false, error: '该前缀已被认领' }, 409);
    }
    if (
      existing.status === 'SOFT_LOCKED' &&
      existing.client_token &&
      existing.client_token !== token
    ) {
      return c.json({ ok: false, error: '该前缀刚刚已被他人临时锁定' }, 409);
    }
  } else {
    // 校验单 IP 每小时最多软锁 3 个不同前缀
    const recentLocks = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM subdomains
       WHERE client_ip_hash = ?
         AND status = 'SOFT_LOCKED'
         AND datetime(created_at) > datetime('now', '-1 hour')`
    )
      .bind(ipHash)
      .first<{ cnt: number }>();

    if ((recentLocks?.cnt || 0) >= 3) {
      return c.json(
        { ok: false, error: '单个 IP 每小时最多软锁 3 个前缀，请先去小红书完成留言' },
        429
      );
    }
  }

  const note =
    '已为你临时锁定该前缀（有效期 2 小时），请尽快前往小红书置顶笔记评论区粘贴口令留言。';

  await c.env.DB.prepare(
    `INSERT INTO subdomains (
        prefix, status, platform, origin_url, title, author_name,
        client_token, client_ip_hash, lock_expires_at, status_note, updated_at
     ) VALUES (?, 'SOFT_LOCKED', ?, ?, ?, '待小红书核验', ?, ?, datetime('now', '+2 hours'), ?, datetime('now'))
     ON CONFLICT(prefix) DO UPDATE SET
        status = 'SOFT_LOCKED',
        platform = excluded.platform,
        origin_url = CASE WHEN excluded.origin_url != '' THEN excluded.origin_url ELSE subdomains.origin_url END,
        title = CASE WHEN excluded.title != '' THEN excluded.title ELSE subdomains.title END,
        client_token = excluded.client_token,
        client_ip_hash = excluded.client_ip_hash,
        lock_expires_at = datetime('now', '+2 hours'),
        status_note = excluded.status_note,
        updated_at = datetime('now')`
  )
    .bind(p, platform, origin_url, title, token, ipHash, note)
    .run();

  return c.json({
    ok: true,
    prefix: p,
    status: 'SOFT_LOCKED',
    lock_hours: 2
  });
});

/**
 * 3. 申请与解析进度查询接口
 * GET /api/applications/status?prefix=tarot
 */
publicRoutes.get('/applications/status', async (c) => {
  const p = sanitizePrefix(c.req.query('prefix') || '');
  if (!p) {
    return c.json({ found: false }, 400);
  }

  // 若软锁已过期，先清理
  await c.env.DB.prepare(
    `DELETE FROM subdomains
     WHERE prefix = ?
       AND status = 'SOFT_LOCKED'
       AND lock_expires_at IS NOT NULL
       AND datetime(lock_expires_at) <= datetime('now')`
  )
    .bind(p)
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM subdomains WHERE prefix = ? LIMIT 1')
    .bind(p)
    .first<SubdomainRow>();

  if (!row || row.status === 'REJECTED' || row.status === 'REVOKED') {
    return c.json({ found: false, prefix: p });
  }

  const doneMap: Record<string, number> = {
    SOFT_LOCKED: 1,
    PENDING_REVIEW: 2,
    ACTIVE: 4
  };

  let note = row.status_note || '';
  if (row.status === 'SOFT_LOCKED' && row.lock_expires_at) {
    const expMs = new Date(row.lock_expires_at + 'Z').getTime();
    const remainMin = Math.max(1, Math.ceil((expMs - Date.now()) / 60_000));
    note = `已生成口令并临时锁定该前缀（剩余约 ${remainMin} 分钟），请尽快前往小红书置顶笔记评论区粘贴口令留言。`;
  } else if (!note) {
    note =
      row.status === 'ACTIVE'
        ? '已上线，全球 HTTPS 边缘反代已生效，作品已登上首页秀场。'
        : '人工审核中，预计 24 小时内完成。';
  }

  return c.json({
    found: true,
    prefix: row.prefix,
    status: row.status,
    done: doneMap[row.status] || 1,
    platform: row.platform || 'Vercel',
    author: row.author_name || '@VibeCoder',
    title: row.title || row.prefix,
    note
  });
});

/**
 * 4. 首页灵感秀场与跑马灯查询接口
 * GET /api/showcase
 */
publicRoutes.get('/showcase', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT prefix, category, stack, is_featured, is_dark, title, tagline, author_name, theme_bg, origin_url
     FROM subdomains
     WHERE status = 'ACTIVE' AND show_in_gallery = 1
     ORDER BY is_featured DESC, datetime(approved_at) DESC, id DESC
     LIMIT 60`
  ).all<SubdomainRow>();

  const items = (rows.results || []).map((r) => ({
    prefix: r.prefix,
    category: r.category || 'tool',
    stack: r.stack || 'AI + Web',
    featured: Boolean(r.is_featured),
    dark: Boolean(r.is_dark),
    title: r.title,
    tagline: r.tagline,
    author: r.author_name,
    bg: r.theme_bg,
    origin_url: r.origin_url
  }));

  const recent_prefixes = items.map((i) => i.prefix).slice(0, 16);

  const totalRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM subdomains WHERE status = 'ACTIVE' AND show_in_gallery = 1`
  ).first<{ cnt: number }>();

  return c.json({
    items,
    total_claimed: totalRow?.cnt ?? items.length,
    recent_prefixes
  });
});

/**
 * 5. 网页表单直接提交申请（替代小红书口令流程）
 * POST /api/submit
 * 写入 PENDING_REVIEW 状态，联系邮箱单独存放在 submission_contacts 表（不在任何公开接口中返回）。
 */
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;
const SUBMIT_CATEGORIES = new Set(['tool', 'creative', 'game']);
const SUBMIT_HOURLY_LIMIT = 5;

export async function ensureContactsTable(env: Env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS submission_contacts (
       prefix     TEXT PRIMARY KEY,
       email      TEXT NOT NULL,
       lang       TEXT NOT NULL DEFAULT 'zh',
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`
  ).run();
}

publicRoutes.post('/submit', async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'Invalid request' }, 400);
  }
  const en = body.lang === 'en';
  const msg = (zh: string, enMsg: string) => (en ? enMsg : zh);
  const str = (k: string, max: number) => String(body[k] ?? '').trim().slice(0, max);

  const p = sanitizePrefix(str('prefix', 40));
  const fmt = validatePrefixFormat(p);
  if (!fmt.valid) return c.json({ ok: false, error: msg('子域名前缀格式不正确', 'Invalid subdomain prefix') }, 400);
  if (await isReservedWord(c.env, p)) {
    return c.json({ ok: false, error: msg('该前缀为系统保留字', 'This prefix is reserved') }, 400);
  }

  const title = str('title', 40);
  const origin_url = str('origin_url', 255);
  const tagline = str('tagline', 60);
  const author = str('author', 30);
  const email = str('email', 120);
  const category = SUBMIT_CATEGORIES.has(str('category', 16)) ? str('category', 16) : 'tool';

  if (!title || !author) return c.json({ ok: false, error: msg('请填写作品名称和署名', 'Project name and display name are required') }, 400);
  if (!EMAIL_RE.test(email)) return c.json({ ok: false, error: msg('邮箱格式不正确', 'Invalid email address') }, 400);
  let originHost = '';
  try {
    const u = new URL(origin_url);
    if (u.protocol !== 'https:') throw new Error('not https');
    originHost = u.hostname.toLowerCase();
  } catch {
    return c.json({ ok: false, error: msg('请填写以 https:// 开头的作品地址', 'Project URL must start with https://') }, 400);
  }
  const rootDomain = (c.env.DOMAIN || 'vibe-show.com').toLowerCase();
  if (originHost === rootDomain || originHost.endsWith(`.${rootDomain}`)) {
    return c.json({ ok: false, error: msg('作品地址不能指向 vibe-show.com', 'Project URL cannot point to vibe-show.com') }, 400);
  }

  const ip = c.req.header('CF-Connecting-IP') || '127.0.0.1';
  const ipHash = await hashIp(ip);
  const recent = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM subdomains
     WHERE client_ip_hash = ? AND status = 'PENDING_REVIEW' AND datetime(created_at) > datetime('now', '-1 hour')`
  )
    .bind(ipHash)
    .first<{ cnt: number }>();
  if ((recent?.cnt || 0) >= SUBMIT_HOURLY_LIMIT) {
    return c.json({ ok: false, error: msg('提交太频繁，请一小时后再试', 'Too many submissions, please try again in an hour') }, 429);
  }

  // 清理过期软锁，再判断占用
  await c.env.DB.prepare(
    `DELETE FROM subdomains WHERE prefix = ? AND status = 'SOFT_LOCKED'
       AND lock_expires_at IS NOT NULL AND datetime(lock_expires_at) <= datetime('now')`
  )
    .bind(p)
    .run();
  const existing = await c.env.DB.prepare('SELECT status FROM subdomains WHERE prefix = ? LIMIT 1')
    .bind(p)
    .first<{ status: string }>();
  if (existing && (existing.status === 'ACTIVE' || existing.status === 'PENDING_REVIEW' || existing.status === 'SOFT_LOCKED')) {
    return c.json({ ok: false, error: msg('该前缀已被占用，请换一个', 'This prefix is already taken') }, 409);
  }

  const platform = detectPlatformFromUrl(origin_url);
  const note = msg('已收到网页提交，人工审核中，预计 24 小时内完成，结果将发送到你的邮箱。', 'Submitted on the web. In review, usually within 24 hours. We will email you the result.');

  await c.env.DB.prepare(
    `INSERT INTO subdomains (
        prefix, status, platform, origin_url, title, category, tagline, author_name,
        client_ip_hash, status_note, created_at, updated_at
     ) VALUES (?, 'PENDING_REVIEW', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(prefix) DO UPDATE SET
        status = 'PENDING_REVIEW', platform = excluded.platform, origin_url = excluded.origin_url,
        title = excluded.title, category = excluded.category, tagline = excluded.tagline,
        author_name = excluded.author_name, client_ip_hash = excluded.client_ip_hash,
        client_token = NULL, lock_expires_at = NULL, status_note = excluded.status_note,
        created_at = datetime('now'), updated_at = datetime('now')`
  )
    .bind(p, platform, origin_url, title, category, tagline, author, ipHash, note)
    .run();

  await ensureContactsTable(c.env);
  await c.env.DB.prepare(
    `INSERT INTO submission_contacts (prefix, email, lang) VALUES (?, ?, ?)
     ON CONFLICT(prefix) DO UPDATE SET email = excluded.email, lang = excluded.lang, created_at = datetime('now')`
  )
    .bind(p, email, en ? 'en' : 'zh')
    .run();

  await c.env.DB.prepare(`INSERT INTO audit_logs (prefix, action, detail) VALUES (?, 'WEB_SUBMIT', ?)`)
    .bind(p, `${title} | ${origin_url}`)
    .run();

  c.executionCtx.waitUntil(
    Promise.all([
      sendMail(c.env, {
        to: email,
        subject: en ? `We received ${p}.vibe-show.com` : `已收到 ${p}.vibe-show.com 的申请`,
        text: en
          ? `Hi ${author},\n\nThanks for submitting "${title}". We will review ${p}.vibe-show.com within 24 hours and email you the result.\n\nCheck status: https://${rootDomain}/en/submit/#status\n\n— vibe-show`
          : `${author} 你好：\n\n感谢提交《${title}》。我们会在 24 小时内审核 ${p}.vibe-show.com，结果会发到这个邮箱。\n\n查询进度：https://${rootDomain}/submit/#status\n\n— vibe-show`
      }),
      c.env.ADMIN_EMAIL
        ? sendMail(c.env, {
            to: c.env.ADMIN_EMAIL,
            subject: `[vibe-show] New submission: ${p}`,
            text: `${title}\n${origin_url}\n${tagline}\nby ${author} <${email}>\n\nReview: https://${rootDomain}/admin`
          })
        : Promise.resolve(false)
    ])
  );

  return c.json({ ok: true, prefix: p, status: 'PENDING_REVIEW' });
});
