#!/usr/bin/env node
/**
 * 确保 vibe-show.com 的边缘解析记录存在（幂等，可重复执行）。
 *
 * 背景：Workers 的 zone route（vibe-show.com/* 与 *.vibe-show.com/*）只有在
 * 对应主机名存在 proxied DNS 记录时才能收到流量。没有记录 → 请求根本到不了
 * Cloudflare 边缘 → 路由形同虚设。
 *
 * 因此需要三条 proxied 占位记录（AAAA 100::，即 Cloudflare 的丢弃地址，
 * 流量永远不会真的打到源站，只用于让主机名解析到边缘）：
 *   - vibe-show.com        主站
 *   - www.vibe-show.com    主站别名
 *   - *.vibe-show.com      创作者子域名泛解析
 *
 * 用法：
 *   set -a; . C:/Users/zhuxuan/.agents/secrets/vibe-show.env; set +a
 *   node scripts/ensure-dns.mjs [--dry-run]
 *
 * 需要权限：Zone → DNS → Edit
 */
const DRY = process.argv.includes('--dry-run');
const { CLOUDFLARE_DNS_API_TOKEN, CF_ZONE_ID } = process.env;

if (!CLOUDFLARE_DNS_API_TOKEN || !CF_ZONE_ID) {
  console.error('✗ 缺少 CLOUDFLARE_DNS_API_TOKEN / CF_ZONE_ID');
  process.exit(1);
}

const BASE = `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}`;
const H = { Authorization: `Bearer ${CLOUDFLARE_DNS_API_TOKEN}`, 'Content-Type': 'application/json' };

const TARGETS = ['vibe-show.com', 'www.vibe-show.com', '*.vibe-show.com'];
const PLACEHOLDER = '100::';

async function api(path, init = {}) {
  const res = await fetch(BASE + path, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const json = await res.json();
  if (!json.success) throw new Error(`${path} -> ${JSON.stringify(json.errors)}`);
  return json.result;
}

const existing = await api('/dns_records?per_page=100');
console.log(`当前 zone 记录数：${existing.length}`);

let changed = 0;

for (const name of TARGETS) {
  // 只看「网站类型」记录：MX / TXT / SRV 等邮件与验证记录不占用 hostname 解析，必须忽略
  const WEB_TYPES = new Set(['A', 'AAAA', 'CNAME']);
  const sameName = existing.filter((r) => r.name === name && WEB_TYPES.has(r.type));

  // 已有 proxied web 记录 → 算满足（不覆盖用户自己的配置）
  if (sameName.some((r) => r.proxied)) {
    const r = sameName.find((x) => x.proxied);
    console.log(`= ${name} 已有 proxied 记录 (${r.type} ${r.content})，跳过`);
    continue;
  }

  // 同名但未 proxied 的 web 记录 → 跳过并告警，交给人工判断，避免误改真实业务记录
  if (sameName.length) {
    console.log(`! ${name} 存在非 proxied web 记录 (${sameName.map((r) => r.type).join(',')})，跳过`);
    continue;
  }

  if (DRY) {
    console.log(`+ 将创建 AAAA ${name} -> ${PLACEHOLDER} (proxied)`);
    changed++;
    continue;
  }

  const rec = await api('/dns_records', {
    method: 'POST',
    body: JSON.stringify({
      type: 'AAAA',
      name,
      content: PLACEHOLDER,
      proxied: true,
      ttl: 1,
      comment: 'vibe-show edge placeholder'
    })
  });
  console.log(`+ 创建 AAAA ${rec.name} -> ${rec.content} (proxied=${rec.proxied})`);
  changed++;
}

console.log(changed ? `\n完成，变更 ${changed} 条` : '\n无事可做，记录已就绪');

if (changed && !DRY) {
  console.log('\n=== 复核 ===');
  for (const r of await api('/dns_records?per_page=100')) {
    console.log(`  ${r.type.padEnd(6)} ${r.name.padEnd(34)} ${String(r.content).slice(0, 40)} proxied=${r.proxied}`);
  }
}
