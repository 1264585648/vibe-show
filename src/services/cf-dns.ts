import { Env } from '../types';

export interface CfDnsProvisionResult {
  ok: boolean;
  record_id: string | null;
  dry_run: boolean;
  message: string;
}

/**
 * 调用 Cloudflare DNS API 为审核通过的 {prefix}.vibe-show.com 创建开启小黄云 (proxied: true) 的 A 记录。
 * 使用 192.0.2.1 (RFC 5737 占位 IP)，开启 Proxied 后流量直接进入绑定 *.vibe-show.com/* 的 Worker 反代引擎，
 * 并自动享有 Cloudflare Universal SSL 免费泛域名 HTTPS 证书。
 */
export async function ensureSubdomainDnsRecord(
  env: Env,
  prefix: string,
  originUrl: string,
  authorName: string
): Promise<CfDnsProvisionResult> {
  const domain = env.DOMAIN || 'vibe-show.com';
  const fqdn = `${prefix}.${domain}`;

  // 本地开发或未配置 Cloudflare Secret 时自动走 Dry-Run 模式，不阻塞本地闭环测试
  if (!env.CF_ZONE_ID || !env.CF_API_TOKEN) {
    return {
      ok: true,
      record_id: `dryrun_${prefix}_${Date.now()}`,
      dry_run: true,
      message: `[Dry-Run] 未配置 CF_ZONE_ID/CF_API_TOKEN，已模拟创建 ${fqdn} -> 192.0.2.1 (Proxied)`
    };
  }

  const headers = {
    Authorization: `Bearer ${env.CF_API_TOKEN}`,
    'Content-Type': 'application/json'
  };

  try {
    // 1. 先查询是否已存在同名记录（幂等更新）
    const listUrl = `https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/dns_records?name=${encodeURIComponent(fqdn)}`;
    const listRes = await fetch(listUrl, { headers });
    const listData = (await listRes.json()) as {
      success: boolean;
      result?: Array<{ id: string; type: string }>;
    };

    const payload = {
      type: 'A',
      name: fqdn,
      content: '192.0.2.1',
      proxied: true,
      ttl: 1,
      comment: `vibe-show: ${authorName || 'creator'} -> ${originUrl}`.slice(0, 95)
    };

    if (listData.success && listData.result && listData.result.length > 0) {
      const existingId = listData.result[0].id;
      const updateRes = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/dns_records/${existingId}`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload)
        }
      );
      const updateData = (await updateRes.json()) as {
        success: boolean;
        result?: { id: string };
        errors?: Array<{ message: string }>;
      };
      if (updateData.success) {
        return {
          ok: true,
          record_id: updateData.result?.id || existingId,
          dry_run: false,
          message: `已更新 Cloudflare DNS 记录: ${fqdn}`
        };
      }
      return {
        ok: false,
        record_id: null,
        dry_run: false,
        message: updateData.errors?.[0]?.message || '更新 Cloudflare DNS 记录失败'
      };
    }

    // 2. 不存在则创建新记录
    const createRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/dns_records`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      }
    );
    const createData = (await createRes.json()) as {
      success: boolean;
      result?: { id: string };
      errors?: Array<{ message: string }>;
    };

    if (createData.success && createData.result?.id) {
      return {
        ok: true,
        record_id: createData.result.id,
        dry_run: false,
        message: `已创建 Cloudflare DNS 记录: ${fqdn} (Proxied)`
      };
    }

    return {
      ok: false,
      record_id: null,
      dry_run: false,
      message: createData.errors?.[0]?.message || '创建 Cloudflare DNS 记录失败'
    };
  } catch (err) {
    return {
      ok: false,
      record_id: null,
      dry_run: false,
      message: `调用 Cloudflare DNS API 异常: ${(err as Error).message}`
    };
  }
}

/**
 * 回收或熔断子域名时，物理删除 Cloudflare DNS 记录
 */
export async function deleteSubdomainDnsRecord(
  env: Env,
  prefix: string,
  cfRecordId?: string | null
): Promise<{ ok: boolean; message: string }> {
  if (!env.CF_ZONE_ID || !env.CF_API_TOKEN) {
    return { ok: true, message: `[Dry-Run] 已模拟删除 ${prefix} 的 DNS 记录` };
  }
  if (cfRecordId && cfRecordId.startsWith('dryrun_')) {
    return { ok: true, message: `[Dry-Run] 忽略模拟记录 ID: ${cfRecordId}` };
  }

  const headers = {
    Authorization: `Bearer ${env.CF_API_TOKEN}`,
    'Content-Type': 'application/json'
  };

  try {
    let targetId = cfRecordId || '';
    if (!targetId) {
      const domain = env.DOMAIN || 'vibe-show.com';
      const fqdn = `${prefix}.${domain}`;
      const listRes = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/dns_records?name=${encodeURIComponent(fqdn)}`,
        { headers }
      );
      const listData = (await listRes.json()) as {
        success: boolean;
        result?: Array<{ id: string }>;
      };
      targetId = listData.result?.[0]?.id || '';
    }

    if (!targetId) {
      return { ok: true, message: '未找到对应 Cloudflare DNS 记录，无需删除' };
    }

    const delRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/dns_records/${targetId}`,
      { method: 'DELETE', headers }
    );
    const delData = (await delRes.json()) as { success: boolean };
    return {
      ok: delData.success,
      message: delData.success ? `已物理删除 Cloudflare DNS 记录 (${targetId})` : '删除 DNS 记录失败'
    };
  } catch (err) {
    return { ok: false, message: `删除 DNS 记录异常: ${(err as Error).message}` };
  }
}
