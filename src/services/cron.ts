import { Env, SubdomainRow } from '../types';
import { deleteSubdomainDnsRecord } from './cf-dns';
import { invalidateProxyCache } from '../proxy';

/**
 * 定时任务：
 * 1. 自动清理超过 2 小时未转正的 SOFT_LOCKED 软锁号记录，释放前缀回公海
 * 2. 巡检 ACTIVE 状态的源站可用性，连续 30 次失败自动回收并删除 Cloudflare DNS 与 KV 路由
 */
export async function runScheduledTasks(env: Env): Promise<{
  expired_locks_cleaned: number;
  checked_active: number;
  revoked_dead: number;
}> {
  // 1. 清理过期软锁号
  const cleanRes = await env.DB.prepare(
    `DELETE FROM subdomains
     WHERE status = 'SOFT_LOCKED'
       AND lock_expires_at IS NOT NULL
       AND datetime(lock_expires_at) <= datetime('now')`
  ).run();
  const expired_locks_cleaned = cleanRes.meta?.changes || 0;

  // 2. 每次最多抽检 20 个最久未检查的 ACTIVE 站点（避免单次 Worker CPU 超限）
  const activeRows = await env.DB.prepare(
    `SELECT * FROM subdomains
     WHERE status = 'ACTIVE'
       AND origin_url != ''
     ORDER BY COALESCE(last_checked_at, '1970-01-01') ASC
     LIMIT 20`
  ).all<SubdomainRow>();

  let checked_active = 0;
  let revoked_dead = 0;

  for (const row of activeRows.results || []) {
    checked_active++;
    let ok = false;
    let status = 0;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(row.origin_url, {
        method: 'GET',
        headers: { 'User-Agent': 'vibe-show-healthcheck/2.0' },
        signal: controller.signal
      });
      clearTimeout(timer);
      status = res.status;
      ok = res.status >= 200 && res.status < 500 && res.status !== 404;
    } catch {
      ok = false;
      status = 0;
    }

    if (ok) {
      await env.DB.prepare(
        `UPDATE subdomains
         SET fail_streak = 0,
             last_http_status = ?,
             last_checked_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ?`
      )
        .bind(status, row.id)
        .run();
    } else {
      const newStreak = (row.fail_streak || 0) + 1;
      if (newStreak >= 30) {
        // 连续 30 天死链：自动删除 DNS + 清理 KV + 置为 REVOKED
        await deleteSubdomainDnsRecord(env, row.prefix, row.cf_record_id);
        await env.PROXY_ROUTES.delete(row.prefix);
        invalidateProxyCache(row.prefix);
        await env.DB.prepare(
          `UPDATE subdomains
           SET status = 'REVOKED',
               fail_streak = ?,
               last_http_status = ?,
               status_note = '源站连续 30 天无法访问，系统已自动回收子域名并清理 DNS 解析。',
               last_checked_at = datetime('now'),
               updated_at = datetime('now')
           WHERE id = ?`
        )
          .bind(newStreak, status, row.id)
          .run();
        revoked_dead++;
      } else {
        await env.DB.prepare(
          `UPDATE subdomains
           SET fail_streak = ?,
               last_http_status = ?,
               last_checked_at = datetime('now'),
               updated_at = datetime('now')
           WHERE id = ?`
        )
          .bind(newStreak, status, row.id)
          .run();
      }
    }
  }

  return { expired_locks_cleaned, checked_active, revoked_dead };
}
