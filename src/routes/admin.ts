import { Hono } from 'hono';
import { Env, ProxyRouteValue, SubdomainRow } from '../types';
import {
  detectPlatformFromUrl,
  parseXhsComment,
  preflightCheckOrigin
} from '../services/xhs-parser';
import {
  deleteSubdomainDnsRecord,
  ensureSubdomainDnsRecord
} from '../services/cf-dns';
import { invalidateProxyCache } from '../proxy';
import { sanitizePrefix, validatePrefixFormat } from './public';

export const adminRoutes = new Hono<{ Bindings: Env }>();

// 管理员鉴权中间件（本地未设置 ADMIN_TOKEN 时默认使用 vibe-admin-2026 方便开箱调试）
adminRoutes.use('*', async (c, next) => {
  const expected = c.env.ADMIN_TOKEN || 'vibe-admin-2026';
  const authHeader = c.req.header('Authorization') || '';
  const token =
    authHeader.replace(/^Bearer\s+/i, '').trim() ||
    c.req.header('x-admin-token') ||
    '';

  if (token !== expected) {
    return c.json({ ok: false, error: 'Unauthorized: 管理口令无效' }, 401);
  }
  await next();
});

/**
 * 1. 粘贴小红书评论一键解析 + 关联软锁草稿 + 源站连通性预检
 * POST /api/admin/parse-xhs
 */
adminRoutes.post('/parse-xhs', async (c) => {
  const body = await c.req.json<{ comment_text?: string }>();
  const parsed = parseXhsComment(body.comment_text || '');

  let existingDraft: SubdomainRow | null = null;
  if (parsed.prefix) {
    existingDraft = await c.env.DB.prepare(
      'SELECT * FROM subdomains WHERE prefix = ? LIMIT 1'
    )
      .bind(parsed.prefix)
      .first<SubdomainRow>();
  }

  // 如果用户在小红书留言漏贴了链接或标题，自动从网页 2h 软锁号草稿补全
  const finalOriginUrl = parsed.origin_url || existingDraft?.origin_url || '';
  let finalTitle = parsed.title || existingDraft?.title || '';
  const finalAuthor = parsed.author_name || existingDraft?.author_name || '@VibeCoder';

  const preflight = await preflightCheckOrigin(finalOriginUrl);
  if (!finalTitle || finalTitle === '我的 AI 编程作品') {
    finalTitle = preflight.detected_title.slice(0, 30) || finalTitle || parsed.prefix;
  }

  return c.json({
    ok: true,
    parsed: {
      prefix: parsed.prefix,
      title: finalTitle,
      origin_url: finalOriginUrl,
      author_name: finalAuthor,
      platform: preflight.detected_platform || detectPlatformFromUrl(finalOriginUrl),
      tagline: preflight.detected_description.slice(0, 40) || existingDraft?.tagline || ''
    },
    existing_record: existingDraft
      ? {
          id: existingDraft.id,
          status: existingDraft.status,
          title: existingDraft.title,
          origin_url: existingDraft.origin_url,
          lock_expires_at: existingDraft.lock_expires_at
        }
      : null,
    preflight
  });
});

/**
 * 2. 获取全部子域名列表与状态统计
 * GET /api/admin/subdomains?status=ALL
 */
adminRoutes.get('/subdomains', async (c) => {
  const statusFilter = c.req.query('status') || 'ALL';

  // 先清理过期软锁号
  await c.env.DB.prepare(
    `DELETE FROM subdomains
     WHERE status = 'SOFT_LOCKED'
       AND lock_expires_at IS NOT NULL
       AND datetime(lock_expires_at) <= datetime('now')`
  ).run();

  const rows =
    statusFilter === 'ALL'
      ? await c.env.DB.prepare(
          'SELECT * FROM subdomains ORDER BY datetime(updated_at) DESC, id DESC LIMIT 200'
        ).all<SubdomainRow>()
      : await c.env.DB.prepare(
          'SELECT * FROM subdomains WHERE status = ? ORDER BY datetime(updated_at) DESC, id DESC LIMIT 200'
        )
          .bind(statusFilter)
          .all<SubdomainRow>();

  const statsRes = await c.env.DB.prepare(
    `SELECT status, COUNT(*) as count FROM subdomains GROUP BY status`
  ).all<{ status: string; count: number }>();

  const counts: Record<string, number> = {
    ACTIVE: 0,
    SOFT_LOCKED: 0,
    PENDING_REVIEW: 0,
    REVOKED: 0
  };
  for (const r of statsRes.results || []) {
    counts[r.status] = r.count;
  }

  return c.json({
    ok: true,
    counts,
    items: rows.results || []
  });
});

/**
 * 3. 一键审核通过并自动配置 Cloudflare DNS + KV 边缘反代路由
 * POST /api/admin/approve
 */
adminRoutes.post('/approve', async (c) => {
  const body = await c.req.json<{
    prefix: string;
    origin_url: string;
    title: string;
    tagline?: string;
    author_name?: string;
    category?: 'tool' | 'creative' | 'game';
    stack?: string;
    platform?: string;
    theme_bg?: string;
    is_dark?: boolean;
    is_featured?: boolean;
    show_in_gallery?: boolean;
    xhs_comment_raw?: string;
    force?: boolean;
  }>();

  const prefix = sanitizePrefix(body.prefix || '');
  const fmt = validatePrefixFormat(prefix);
  if (!fmt.valid) {
    return c.json({ ok: false, error: fmt.msg || '前缀不合法' }, 400);
  }

  const origin_url = (body.origin_url || '').trim();
  if (!/^https?:\/\//i.test(origin_url)) {
    return c.json({ ok: false, error: '请填写以 http(s):// 开头的有效源站 URL' }, 400);
  }

  const author_name = (body.author_name || '@VibeCoder').trim();
  const title = (body.title || prefix).trim().slice(0, 30);
  const tagline = (body.tagline || 'AI 编程灵感作品').trim().slice(0, 40);
  const category = body.category || 'tool';
  const platform = body.platform || detectPlatformFromUrl(origin_url);
  const stack = (body.stack || `${platform} + AI`).trim().slice(0, 24);
  const theme_bg =
    body.theme_bg || 'from-[#EDF5FF] via-[#E3EFFE] to-[#D5E6FB]';
  const is_dark = body.is_dark ? 1 : 0;
  const is_featured = body.is_featured ? 1 : 0;
  const show_in_gallery = body.show_in_gallery === false ? 0 : 1;

  // 单创作者配额检查（同一小红书账号最多 3 个 ACTIVE 子域名）
  if (!body.force && author_name && author_name !== '@VibeCoder') {
    const quotaRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM subdomains
       WHERE author_name = ? AND status = 'ACTIVE' AND prefix != ?`
    )
      .bind(author_name, prefix)
      .first<{ cnt: number }>();

    if ((quotaRow?.cnt || 0) >= 3) {
      return c.json(
        {
          ok: false,
          error: `创作者 ${author_name} 已持有 ${quotaRow?.cnt} 个有效子域名（超出单人 3 个配额上限），如需强制放行请勾选强制通过`
        },
        409
      );
    }
  }

  // 1. 调用 Cloudflare DNS API 创建 {prefix}.vibe-show.com (Proxied)
  const dnsResult = await ensureSubdomainDnsRecord(
    c.env,
    prefix,
    origin_url,
    author_name
  );
  if (!dnsResult.ok) {
    return c.json({ ok: false, error: dnsResult.message }, 502);
  }

  // 2. 写入 Workers KV 边缘反代路由表并刷新 Worker 内存缓存
  const routeValue: ProxyRouteValue = {
    origin: origin_url,
    status: 'ACTIVE',
    title,
    author: author_name,
    updated_at: new Date().toISOString()
  };
  await c.env.PROXY_ROUTES.put(prefix, JSON.stringify(routeValue));
  invalidateProxyCache(prefix);

  // 3. 写入 D1 数据库
  const statusNote =
    '已上线！无需在部署平台做任何配置，全球 HTTPS 边缘反代已生效，作品已登上首页秀场。';

  await c.env.DB.prepare(
    `INSERT INTO subdomains (
        prefix, status, platform, origin_url, cf_record_id,
        title, category, stack, tagline, author_name, xhs_comment_raw,
        theme_bg, is_dark, is_featured, show_in_gallery,
        status_note, fail_streak, approved_at, updated_at
     ) VALUES (?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
     ON CONFLICT(prefix) DO UPDATE SET
        status = 'ACTIVE',
        platform = excluded.platform,
        origin_url = excluded.origin_url,
        cf_record_id = excluded.cf_record_id,
        title = excluded.title,
        category = excluded.category,
        stack = excluded.stack,
        tagline = excluded.tagline,
        author_name = excluded.author_name,
        xhs_comment_raw = COALESCE(excluded.xhs_comment_raw, subdomains.xhs_comment_raw),
        theme_bg = excluded.theme_bg,
        is_dark = excluded.is_dark,
        is_featured = excluded.is_featured,
        show_in_gallery = excluded.show_in_gallery,
        status_note = excluded.status_note,
        fail_streak = 0,
        lock_expires_at = NULL,
        approved_at = COALESCE(subdomains.approved_at, datetime('now')),
        updated_at = datetime('now')`
  )
    .bind(
      prefix,
      platform,
      origin_url,
      dnsResult.record_id,
      title,
      category,
      stack,
      tagline,
      author_name,
      body.xhs_comment_raw || null,
      theme_bg,
      is_dark,
      is_featured,
      show_in_gallery,
      statusNote
    )
    .run();

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (prefix, action, detail) VALUES (?, 'APPROVE', ?)`
  )
    .bind(prefix, `${author_name} -> ${origin_url} (${dnsResult.message})`)
    .run();

  const domain = c.env.DOMAIN || 'vibe-show.com';
  const xhs_reply_text = `🎉 恭喜！你的专属子域名已开通生效：https://${prefix}.${domain} （已开启 Cloudflare 全球边缘 HTTPS 反代，无需在 ${platform} 后台做任何配置，作品《${title}》已同步登上 ${domain} 首页灵感秀场！）`;

  return c.json({
    ok: true,
    prefix,
    full_url: `https://${prefix}.${domain}`,
    dns: dnsResult,
    xhs_reply_text
  });
});

/**
 * 4. 一键熔断回收 / 删除子域名（同步删除 Cloudflare DNS 与 KV 路由）
 * POST /api/admin/revoke
 */
adminRoutes.post('/revoke', async (c) => {
  const body = await c.req.json<{ prefix: string; reason?: string; hard_delete?: boolean }>();
  const prefix = sanitizePrefix(body.prefix || '');
  if (!prefix) {
    return c.json({ ok: false, error: '请提供要回收的前缀' }, 400);
  }

  const row = await c.env.DB.prepare('SELECT * FROM subdomains WHERE prefix = ? LIMIT 1')
    .bind(prefix)
    .first<SubdomainRow>();

  if (!row) {
    return c.json({ ok: false, error: '未找到该子域名记录' }, 404);
  }

  // 1. 删除 Cloudflare DNS 记录
  const dnsDel = await deleteSubdomainDnsRecord(c.env, prefix, row.cf_record_id);

  // 2. 删除 Workers KV 路由与内存缓存
  await c.env.PROXY_ROUTES.delete(prefix);
  invalidateProxyCache(prefix);

  // 3. 更新或删除 D1 记录（直接删除可立即释放 UNIQUE 约束供他人重新申请）
  if (body.hard_delete !== false) {
    await c.env.DB.prepare('DELETE FROM subdomains WHERE prefix = ?').bind(prefix).run();
  } else {
    await c.env.DB.prepare(
      `UPDATE subdomains
       SET status = 'REVOKED',
           status_note = ?,
           updated_at = datetime('now')
       WHERE prefix = ?`
    )
      .bind(body.reason || '已由管理员回收下架', prefix)
      .run();
  }

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (prefix, action, detail) VALUES (?, 'REVOKE', ?)`
  )
    .bind(prefix, body.reason || dnsDel.message)
    .run();

  return c.json({
    ok: true,
    prefix,
    dns_message: dnsDel.message
  });
});
