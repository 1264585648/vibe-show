import { Context, Hono } from 'hono';
import { Env } from '../types';
import {
  CfApiResult,
  createDestinationAddress,
  createRoutingRule,
  deleteDestinationAddress,
  deleteRoutingRule,
  EmailAuthOverride,
  getEmailOverview,
  isValidEmailAddress,
  normalizeEmailPrefix,
  updateCatchAllRule,
  updateRoutingRule
} from '../services/cf-email';
import { sendMailDetailed } from '../services/mail';

export const adminEmailRoutes = new Hono<{ Bindings: Env }>();

async function readJsonBody<T>(c: Context<{ Bindings: Env }>): Promise<T | null> {
  try {
    return await c.req.json<T>();
  } catch {
    return null;
  }
}

function getOverride(c: Context<{ Bindings: Env }>): EmailAuthOverride | undefined {
  const token = (c.req.header('x-cf-email-token') || '').trim();
  const accountId = (c.req.header('x-cf-account-id') || '').trim();
  if (!token && !accountId) return undefined;
  return { token: token || undefined, accountId: accountId || undefined };
}

async function writeAudit(env: Env, prefix: string, action: string, detail: string): Promise<void> {
  try {
    await env.DB.prepare('INSERT INTO audit_logs (prefix, action, detail) VALUES (?, ?, ?)')
      .bind(prefix, action, detail.slice(0, 300))
      .run();
  } catch (err) {
    console.warn('[admin-email] audit log failed', err);
  }
}

function cfErrorResponse<T>(c: Context<{ Bindings: Env }>, res: CfApiResult<T>) {
  const allowedStatus = res.status === 400 || res.status === 401 || res.status === 403 || res.status === 409
    ? res.status
    : 502;
  return c.json(
    {
      ok: false,
      error: res.error || '操作失败',
      needs_permission: Boolean(res.needsPermission),
      cf_code: res.cfCode
    },
    allowedStatus
  );
}

/**
 * 1. 获取子邮箱（Cloudflare Email Routing + Resend）全量状态
 * GET /api/admin/email/overview
 */
adminEmailRoutes.get('/overview', async (c) => {
  const data = await getEmailOverview(c.env, getOverride(c));
  return c.json({ ok: true, ...data });
});

/**
 * 2. 新增子邮箱转发/丢弃规则
 * POST /api/admin/email/rules
 */
adminEmailRoutes.post('/rules', async (c) => {
  const body = await readJsonBody<{
    prefix?: string;
    action?: 'forward' | 'drop';
    destination?: string;
    name?: string;
    enabled?: boolean;
  }>(c);
  if (!body) return c.json({ ok: false, error: '请求体 JSON 格式不正确' }, 400);

  const res = await createRoutingRule(c.env, getOverride(c), {
    prefix: body.prefix || '',
    action: body.action === 'drop' ? 'drop' : 'forward',
    destination: body.destination,
    name: body.name,
    enabled: body.enabled
  });

  if (!res.ok || !res.result) return cfErrorResponse(c, res);

  await writeAudit(
    c.env,
    `mail:${res.result.prefix}`,
    'EMAIL_RULE_CREATE',
    `${res.result.address} -> ${res.result.action} ${res.result.destinations.join(',')}`
  );
  return c.json({ ok: true, rule: res.result });
});

/**
 * 3. 更新已有子邮箱规则（启停、修改转发目标等）
 * PUT /api/admin/email/rules/:id
 */
adminEmailRoutes.put('/rules/:id', async (c) => {
  const ruleId = c.req.param('id');
  const body = await readJsonBody<{
    enabled?: boolean;
    action?: 'forward' | 'drop';
    destination?: string;
    name?: string;
  }>(c);
  if (!body) return c.json({ ok: false, error: '请求体 JSON 格式不正确' }, 400);

  const res = await updateRoutingRule(c.env, getOverride(c), ruleId, body);
  if (!res.ok || !res.result) return cfErrorResponse(c, res);

  await writeAudit(
    c.env,
    `mail:${res.result.prefix}`,
    'EMAIL_RULE_UPDATE',
    `enabled=${res.result.enabled} -> ${res.result.action} ${res.result.destinations.join(',')}`
  );
  return c.json({ ok: true, rule: res.result });
});

/**
 * 4. 删除子邮箱规则
 * DELETE /api/admin/email/rules/:id
 */
adminEmailRoutes.delete('/rules/:id', async (c) => {
  const ruleId = c.req.param('id');
  const res = await deleteRoutingRule(c.env, getOverride(c), ruleId);
  if (!res.ok) return cfErrorResponse(c, res);

  await writeAudit(c.env, 'mail:rule', 'EMAIL_RULE_DELETE', `ruleId=${ruleId}`);
  return c.json({ ok: true });
});

/**
 * 5. 更新 Catch-all 兜底规则 (*@vibe-show.com)
 * PUT /api/admin/email/catch-all
 */
adminEmailRoutes.put('/catch-all', async (c) => {
  const body = await readJsonBody<{
    enabled?: boolean;
    action?: 'forward' | 'drop';
    destination?: string;
  }>(c);
  if (!body) return c.json({ ok: false, error: '请求体 JSON 格式不正确' }, 400);

  const res = await updateCatchAllRule(c.env, getOverride(c), {
    enabled: Boolean(body.enabled),
    action: body.action === 'drop' ? 'drop' : 'forward',
    destination: body.destination
  });
  if (!res.ok) return cfErrorResponse(c, res);

  await writeAudit(
    c.env,
    'mail:*',
    'EMAIL_CATCHALL_UPDATE',
    `enabled=${Boolean(body.enabled)} action=${body.action || 'forward'} dest=${body.destination || ''}`
  );
  return c.json({ ok: true, catch_all: res.result });
});

/**
 * 6. 添加目标接收邮箱（Cloudflare 将发送验证邮件）
 * POST /api/admin/email/destinations
 */
adminEmailRoutes.post('/destinations', async (c) => {
  const body = await readJsonBody<{ email?: string }>(c);
  if (!body) return c.json({ ok: false, error: '请求体 JSON 格式不正确' }, 400);
  const res = await createDestinationAddress(c.env, getOverride(c), body.email || '');
  if (!res.ok) return cfErrorResponse(c, res);

  await writeAudit(c.env, 'mail:dest', 'EMAIL_DEST_CREATE', res.result?.email || body.email || '');
  return c.json({
    ok: true,
    destination: res.result,
    message: '已添加目标邮箱，Cloudflare 已发送验证邮件，请点击邮件内链接完成验证'
  });
});

/**
 * 7. 删除目标接收邮箱
 * DELETE /api/admin/email/destinations/:id
 */
adminEmailRoutes.delete('/destinations/:id', async (c) => {
  const destId = c.req.param('id');
  const res = await deleteDestinationAddress(c.env, getOverride(c), destId);
  if (!res.ok) return cfErrorResponse(c, res);

  await writeAudit(c.env, 'mail:dest', 'EMAIL_DEST_DELETE', `destId=${destId}`);
  return c.json({ ok: true });
});

/**
 * 8. 通过 Resend 以任意 @vibe-show.com 子邮箱身份发信
 * POST /api/admin/email/send
 */
adminEmailRoutes.post('/send', async (c) => {
  const body = await readJsonBody<{
    from_prefix?: string;
    from_name?: string;
    to?: string;
    reply_to?: string;
    subject?: string;
    text?: string;
  }>(c);
  if (!body) return c.json({ ok: false, error: '请求体 JSON 格式不正确' }, 400);

  const domain = (c.env.DOMAIN || 'vibe-show.com').trim().toLowerCase();
  const norm = normalizeEmailPrefix(body.from_prefix || '', domain);
  if (!norm.ok) return c.json({ ok: false, error: norm.error }, 400);

  const to = (body.to || '').trim();
  if (!isValidEmailAddress(to)) {
    return c.json({ ok: false, error: '收件人邮箱格式不正确' }, 400);
  }

  const replyTo = (body.reply_to || '').trim();
  if (replyTo && !isValidEmailAddress(replyTo)) {
    return c.json({ ok: false, error: 'Reply-To 邮箱格式不正确' }, 400);
  }

  const subject = (body.subject || '').trim().slice(0, 200);
  const text = (body.text || '').trim().slice(0, 20000);
  if (!subject || !text) {
    return c.json({ ok: false, error: '请填写邮件主题与正文' }, 400);
  }

  const cleanName = (body.from_name || '').replace(/[\r\n<>"]/g, '').trim().slice(0, 60);
  const from = cleanName ? `${cleanName} <${norm.address}>` : norm.address;

  const sent = await sendMailDetailed(c.env, {
    from,
    to,
    replyTo: replyTo || undefined,
    subject,
    text
  });

  if (!sent.ok) {
    return c.json({ ok: false, error: sent.error || '发信失败' }, sent.skipped ? 400 : 502);
  }

  await writeAudit(c.env, `mail:${norm.prefix}`, 'EMAIL_SEND', `${norm.address} -> ${to} (${subject})`);
  return c.json({ ok: true, id: sent.id, from });
});
