import { Env } from '../types';

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';
const LOCAL_PART_RE = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

export interface EmailAuthOverride {
  token?: string;
  accountId?: string;
}

export interface CfMatcher {
  type: 'literal' | 'all' | string;
  field?: string;
  value?: string;
}

export interface CfAction {
  type: 'forward' | 'drop' | 'worker' | string;
  value?: string[];
}

export interface CfRoutingRuleRaw {
  id?: string;
  tag?: string;
  name?: string;
  enabled?: boolean;
  priority?: number;
  matchers?: CfMatcher[];
  actions?: CfAction[];
}

export interface NormalizedRoutingRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  address: string;
  prefix: string;
  action: 'forward' | 'drop' | 'worker' | 'unknown';
  destinations: string[];
}

export interface CfDestinationAddress {
  id: string;
  email: string;
  verified: string | null;
  created?: string;
  modified?: string;
}

export interface CfRoutingSettings {
  enabled?: boolean;
  status?: string;
  skip_wizard?: boolean;
  name?: string;
}

export interface CfApiResult<T> {
  ok: boolean;
  status: number;
  result?: T;
  resultInfo?: { page?: number; total_pages?: number; total_count?: number };
  error?: string;
  cfCode?: number;
  needsPermission?: boolean;
}

export interface EmailOverviewData {
  domain: string;
  zone_configured: boolean;
  token_configured: boolean;
  account_id: string | null;
  resend_configured: boolean;
  mail_from_default: string;
  routing_status: CfRoutingSettings | null;
  rules: NormalizedRoutingRule[];
  catch_all: {
    id?: string;
    enabled: boolean;
    name: string;
    action: 'forward' | 'drop' | 'worker' | 'unknown';
    destinations: string[];
  } | null;
  destinations: CfDestinationAddress[];
  permissions: {
    rules_ok: boolean;
    destinations_ok: boolean;
    routing_status_ok: boolean;
  };
  warnings: string[];
}

function getDomain(env: Env): string {
  return (env.DOMAIN || 'vibe-show.com').trim().toLowerCase();
}

function getToken(env: Env, override?: EmailAuthOverride): string {
  return (override?.token || env.CF_EMAIL_API_TOKEN || env.CF_API_TOKEN || '').trim();
}

export function isValidEmailAddress(email: string): boolean {
  return EMAIL_RE.test((email || '').trim());
}

/**
 * Normalize a sub-mailbox prefix (accepts either `hi` or `hi@vibe-show.com`) and validate format.
 */
export function normalizeEmailPrefix(
  raw: string,
  domain: string
): { ok: true; prefix: string; address: string } | { ok: false; error: string } {
  const cleaned = (raw || '').trim().toLowerCase();
  if (!cleaned) {
    return { ok: false, error: '请输入子邮箱前缀' };
  }

  let local = cleaned;
  if (cleaned.includes('@')) {
    const parts = cleaned.split('@');
    if (parts.length !== 2 || parts[1] !== domain) {
      return { ok: false, error: `只能操作 @${domain} 下的子邮箱` };
    }
    local = parts[0];
  }

  if (!LOCAL_PART_RE.test(local) || local.includes('..')) {
    return {
      ok: false,
      error: '前缀格式不正确：仅支持小写字母、数字及 . _ + -，且不能以符号开头/结尾或包含连续点号'
    };
  }

  return { ok: true, prefix: local, address: `${local}@${domain}` };
}

async function cfRequest<T>(token: string, path: string, init?: RequestInit): Promise<CfApiResult<T>> {
  try {
    const res = await fetch(`${CF_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {})
      }
    });
    const rawText = await res.text();
    let data: {
      success?: boolean;
      result?: T;
      result_info?: { page?: number; total_pages?: number; total_count?: number };
      errors?: Array<{ code?: number; message?: string }>;
    } = {};
    try {
      data = rawText ? (JSON.parse(rawText) as typeof data) : {};
    } catch {
      return {
        ok: false,
        status: res.status || 502,
        error: `Cloudflare 返回非 JSON 响应 (HTTP ${res.status})`
      };
    }

    const cfCode = data.errors?.[0]?.code;
    const message = data.errors?.[0]?.message || (res.ok ? undefined : `Cloudflare HTTP ${res.status}`);
    const needsPermission = res.status === 401 || res.status === 403 || cfCode === 10000 || cfCode === 9109;

    if (!res.ok || !data.success) {
      return {
        ok: false,
        status: res.status || 502,
        error: message || 'Cloudflare API 请求失败',
        cfCode,
        needsPermission
      };
    }
    return {
      ok: true,
      status: res.status,
      result: data.result,
      resultInfo: data.result_info
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: `请求 Cloudflare API 异常: ${(err as Error).message}`
    };
  }
}

async function listPaginated<T>(token: string, basePath: string): Promise<CfApiResult<T[]>> {
  const items: T[] = [];
  let page = 1;
  const maxPages = 10;

  while (page <= maxPages) {
    const sep = basePath.includes('?') ? '&' : '?';
    const res = await cfRequest<T[]>(token, `${basePath}${sep}page=${page}&per_page=50`);
    if (!res.ok) return res;
    if (Array.isArray(res.result)) items.push(...res.result);
    const totalPages = res.resultInfo?.total_pages || 1;
    if (page >= totalPages) break;
    page++;
  }

  return { ok: true, status: 200, result: items };
}

function normalizeRule(raw: CfRoutingRuleRaw, domain: string): NormalizedRoutingRule | null {
  const literal = raw.matchers?.find((m) => m.type === 'literal' && m.field === 'to' && m.value);
  if (!literal?.value) return null;

  const address = literal.value.toLowerCase();
  const prefix = address.endsWith(`@${domain}`) ? address.slice(0, -(domain.length + 1)) : address;
  const act = raw.actions?.[0];
  const actionType =
    act?.type === 'forward' || act?.type === 'drop' || act?.type === 'worker' ? act.type : 'unknown';

  return {
    id: raw.id || raw.tag || '',
    name: raw.name || address,
    enabled: Boolean(raw.enabled),
    priority: typeof raw.priority === 'number' ? raw.priority : 0,
    address,
    prefix,
    action: actionType,
    destinations: Array.isArray(act?.value) ? act.value : []
  };
}

function buildRuleActions(action: 'forward' | 'drop', destination?: string): CfAction[] {
  if (action === 'drop') return [{ type: 'drop' }];
  return [{ type: 'forward', value: [(destination || '').trim()] }];
}

async function resolveAccountId(
  env: Env,
  token: string,
  zoneId: string,
  override?: EmailAuthOverride
): Promise<{ ok: true; accountId: string } | { ok: false; error: string }> {
  const explicit = (override?.accountId || env.CF_ACCOUNT_ID || '').trim();
  if (explicit) return { ok: true, accountId: explicit };

  const zoneRes = await cfRequest<{ account?: { id?: string } }>(token, `/zones/${zoneId}`);
  const accountId = zoneRes.result?.account?.id?.trim();
  if (zoneRes.ok && accountId) {
    return { ok: true, accountId };
  }
  return {
    ok: false,
    error:
      zoneRes.error ||
      '无法自动获取 CF_ACCOUNT_ID，请在 Worker Secrets 添加 CF_ACCOUNT_ID，或为 Token 开通 Zone → Zone → Read 权限'
  };
}

function requireBaseConfig(
  env: Env,
  override?: EmailAuthOverride
): { ok: true; token: string; zoneId: string; domain: string } | { ok: false; status: number; error: string } {
  const token = getToken(env, override);
  const zoneId = (env.CF_ZONE_ID || '').trim();
  const domain = getDomain(env);
  if (!zoneId) {
    return { ok: false, status: 500, error: 'Worker 未配置 CF_ZONE_ID Secret' };
  }
  if (!token) {
    return { ok: false, status: 400, error: '缺少 Cloudflare API Token（CF_EMAIL_API_TOKEN / CF_API_TOKEN）' };
  }
  return { ok: true, token, zoneId, domain };
}

/**
 * Fetch Cloudflare Email Routing status, custom rules, catch-all rule, and destination addresses.
 */
export async function getEmailOverview(env: Env, override?: EmailAuthOverride): Promise<EmailOverviewData> {
  const domain = getDomain(env);
  const token = getToken(env, override);
  const zoneId = (env.CF_ZONE_ID || '').trim();

  const empty: EmailOverviewData = {
    domain,
    zone_configured: Boolean(zoneId),
    token_configured: Boolean(token),
    account_id: (override?.accountId || env.CF_ACCOUNT_ID || '').trim() || null,
    resend_configured: Boolean(env.RESEND_API_KEY),
    mail_from_default: env.MAIL_FROM || `vibe-show <hi@${domain}>`,
    routing_status: null,
    rules: [],
    catch_all: null,
    destinations: [],
    permissions: {
      rules_ok: false,
      destinations_ok: false,
      routing_status_ok: false
    },
    warnings: []
  };

  if (!zoneId || !token) {
    empty.warnings.push(!zoneId ? 'Worker 尚未配置 CF_ZONE_ID' : '缺少 Cloudflare API Token');
    return empty;
  }

  const [statusRes, rulesRes, catchAllRes, accRes] = await Promise.all([
    cfRequest<CfRoutingSettings>(token, `/zones/${zoneId}/email/routing`),
    listPaginated<CfRoutingRuleRaw>(token, `/zones/${zoneId}/email/routing/rules`),
    cfRequest<CfRoutingRuleRaw>(token, `/zones/${zoneId}/email/routing/rules/catch_all`),
    resolveAccountId(env, token, zoneId, override)
  ]);

  if (statusRes.ok && statusRes.result) {
    empty.routing_status = statusRes.result;
    empty.permissions.routing_status_ok = true;
  } else if (statusRes.error) {
    empty.warnings.push(`路由状态读取失败：${statusRes.error}`);
  }

  if (rulesRes.ok && rulesRes.result) {
    empty.permissions.rules_ok = true;
    empty.rules = rulesRes.result
      .map((r) => normalizeRule(r, domain))
      .filter((r): r is NormalizedRoutingRule => Boolean(r))
      .sort((a, b) => a.prefix.localeCompare(b.prefix));
  } else if (rulesRes.error) {
    empty.warnings.push(
      `子邮箱规则读取失败（需 Zone → Email Routing Rules → Edit 权限）：${rulesRes.error}`
    );
  }

  if (catchAllRes.ok && catchAllRes.result) {
    const act = catchAllRes.result.actions?.[0];
    const actionType =
      act?.type === 'forward' || act?.type === 'drop' || act?.type === 'worker' ? act.type : 'unknown';
    empty.catch_all = {
      id: catchAllRes.result.id || catchAllRes.result.tag,
      enabled: Boolean(catchAllRes.result.enabled),
      name: catchAllRes.result.name || 'Catch-all',
      action: actionType,
      destinations: Array.isArray(act?.value) ? act.value : []
    };
  }

  if (accRes.ok) {
    empty.account_id = accRes.accountId;
    const destRes = await listPaginated<CfDestinationAddress>(
      token,
      `/accounts/${accRes.accountId}/email/routing/addresses`
    );
    if (destRes.ok && destRes.result) {
      empty.permissions.destinations_ok = true;
      empty.destinations = destRes.result.sort((a, b) => a.email.localeCompare(b.email));
    } else if (destRes.error) {
      empty.warnings.push(
        `目标接收邮箱读取失败（需 Account → Email Routing Addresses → Edit 权限）：${destRes.error}`
      );
    }
  } else {
    empty.warnings.push(accRes.error);
  }

  return empty;
}

export async function createRoutingRule(
  env: Env,
  override: EmailAuthOverride | undefined,
  input: {
    prefix: string;
    action: 'forward' | 'drop';
    destination?: string;
    name?: string;
    enabled?: boolean;
  }
): Promise<CfApiResult<NormalizedRoutingRule>> {
  const cfg = requireBaseConfig(env, override);
  if (!cfg.ok) return { ok: false, status: cfg.status, error: cfg.error };

  const norm = normalizeEmailPrefix(input.prefix, cfg.domain);
  if (!norm.ok) return { ok: false, status: 400, error: norm.error };

  const action = input.action === 'drop' ? 'drop' : 'forward';
  const destination = (input.destination || '').trim().toLowerCase();
  if (action === 'forward' && !isValidEmailAddress(destination)) {
    return { ok: false, status: 400, error: '请选择或填写有效的目标接收邮箱' };
  }

  // Prevent duplicate literal rules for the same sub-address
  const existing = await listPaginated<CfRoutingRuleRaw>(cfg.token, `/zones/${cfg.zoneId}/email/routing/rules`);
  if (existing.ok && existing.result) {
    const dup = existing.result
      .map((r) => normalizeRule(r, cfg.domain))
      .find((r) => r && r.address === norm.address);
    if (dup) {
      return {
        ok: false,
        status: 409,
        error: `${norm.address} 已存在转发规则，请在右侧列表直接编辑或切换状态`
      };
    }
  }

  const res = await cfRequest<CfRoutingRuleRaw>(cfg.token, `/zones/${cfg.zoneId}/email/routing/rules`, {
    method: 'POST',
    body: JSON.stringify({
      name: (input.name || `vibe-show: ${norm.address}`).trim().slice(0, 90),
      enabled: input.enabled !== false,
      priority: 0,
      matchers: [{ type: 'literal', field: 'to', value: norm.address }],
      actions: buildRuleActions(action, destination)
    })
  });

  if (!res.ok || !res.result) return { ...res, result: undefined };
  return {
    ok: true,
    status: res.status,
    result: normalizeRule(res.result, cfg.domain) || undefined
  };
}

export async function updateRoutingRule(
  env: Env,
  override: EmailAuthOverride | undefined,
  ruleId: string,
  input: {
    enabled?: boolean;
    action?: 'forward' | 'drop';
    destination?: string;
    name?: string;
  }
): Promise<CfApiResult<NormalizedRoutingRule>> {
  const cfg = requireBaseConfig(env, override);
  if (!cfg.ok) return { ok: false, status: cfg.status, error: cfg.error };
  if (!ruleId) return { ok: false, status: 400, error: '缺少规则 ID' };

  const currentRes = await cfRequest<CfRoutingRuleRaw>(
    cfg.token,
    `/zones/${cfg.zoneId}/email/routing/rules/${encodeURIComponent(ruleId)}`
  );
  if (!currentRes.ok || !currentRes.result) {
    return { ...currentRes, result: undefined };
  }

  const cur = currentRes.result;
  const nextAction = input.action || (cur.actions?.[0]?.type === 'drop' ? 'drop' : 'forward');
  const nextDest = (input.destination ?? cur.actions?.[0]?.value?.[0] ?? '').trim().toLowerCase();

  if (nextAction === 'forward' && !isValidEmailAddress(nextDest)) {
    return { ok: false, status: 400, error: '转发动作必须指定有效的目标邮箱' };
  }

  const res = await cfRequest<CfRoutingRuleRaw>(
    cfg.token,
    `/zones/${cfg.zoneId}/email/routing/rules/${encodeURIComponent(ruleId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        name: (input.name ?? cur.name ?? 'vibe-show rule').trim().slice(0, 90),
        enabled: input.enabled ?? Boolean(cur.enabled),
        priority: typeof cur.priority === 'number' ? cur.priority : 0,
        matchers: cur.matchers || [],
        actions: buildRuleActions(nextAction, nextDest)
      })
    }
  );

  if (!res.ok || !res.result) return { ...res, result: undefined };
  return {
    ok: true,
    status: res.status,
    result: normalizeRule(res.result, cfg.domain) || undefined
  };
}

export async function deleteRoutingRule(
  env: Env,
  override: EmailAuthOverride | undefined,
  ruleId: string
): Promise<CfApiResult<unknown>> {
  const cfg = requireBaseConfig(env, override);
  if (!cfg.ok) return { ok: false, status: cfg.status, error: cfg.error };
  if (!ruleId) return { ok: false, status: 400, error: '缺少规则 ID' };

  return cfRequest(cfg.token, `/zones/${cfg.zoneId}/email/routing/rules/${encodeURIComponent(ruleId)}`, {
    method: 'DELETE'
  });
}

export async function updateCatchAllRule(
  env: Env,
  override: EmailAuthOverride | undefined,
  input: { enabled: boolean; action: 'forward' | 'drop'; destination?: string }
): Promise<CfApiResult<CfRoutingRuleRaw>> {
  const cfg = requireBaseConfig(env, override);
  if (!cfg.ok) return { ok: false, status: cfg.status, error: cfg.error };

  const enabled = Boolean(input.enabled);
  let action: 'forward' | 'drop' = input.action === 'drop' ? 'drop' : 'forward';
  const destination = (input.destination || '').trim().toLowerCase();

  if (action === 'forward' && !isValidEmailAddress(destination)) {
    if (enabled) {
      return { ok: false, status: 400, error: 'Catch-all 启用转发时必须选择一个有效的目标接收邮箱' };
    }
    // Cloudflare rejects empty forward destinations even when disabled; fall back to disabled drop
    action = 'drop';
  }

  return cfRequest<CfRoutingRuleRaw>(cfg.token, `/zones/${cfg.zoneId}/email/routing/rules/catch_all`, {
    method: 'PUT',
    body: JSON.stringify({
      name: `vibe-show catch-all (*@${cfg.domain})`,
      enabled,
      matchers: [{ type: 'all' }],
      actions: buildRuleActions(action, destination)
    })
  });
}

export async function createDestinationAddress(
  env: Env,
  override: EmailAuthOverride | undefined,
  emailRaw: string
): Promise<CfApiResult<CfDestinationAddress>> {
  const cfg = requireBaseConfig(env, override);
  if (!cfg.ok) return { ok: false, status: cfg.status, error: cfg.error };

  const email = (emailRaw || '').trim().toLowerCase();
  if (!isValidEmailAddress(email)) {
    return { ok: false, status: 400, error: '请输入有效的目标接收邮箱' };
  }

  const acc = await resolveAccountId(env, cfg.token, cfg.zoneId, override);
  if (!acc.ok) return { ok: false, status: 400, error: acc.error };

  return cfRequest<CfDestinationAddress>(cfg.token, `/accounts/${acc.accountId}/email/routing/addresses`, {
    method: 'POST',
    body: JSON.stringify({ email })
  });
}

export async function deleteDestinationAddress(
  env: Env,
  override: EmailAuthOverride | undefined,
  destId: string
): Promise<CfApiResult<unknown>> {
  const cfg = requireBaseConfig(env, override);
  if (!cfg.ok) return { ok: false, status: cfg.status, error: cfg.error };
  if (!destId) return { ok: false, status: 400, error: '缺少目标邮箱 ID' };

  const acc = await resolveAccountId(env, cfg.token, cfg.zoneId, override);
  if (!acc.ok) return { ok: false, status: 400, error: acc.error };

  return cfRequest(
    cfg.token,
    `/accounts/${acc.accountId}/email/routing/addresses/${encodeURIComponent(destId)}`,
    { method: 'DELETE' }
  );
}
