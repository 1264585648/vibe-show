import { Env, ProxyRouteValue, SubdomainRow } from './types';

// Worker 实例级 60s 内存路由缓存（降低 KV 与 D1 读取消耗，实现 <1ms 路由定位）
const memoryRouteCache = new Map<string, { data: ProxyRouteValue | null; exp: number }>();

export function invalidateProxyCache(prefix: string) {
  memoryRouteCache.delete(prefix.toLowerCase());
}

/**
 * 读取子域名反向代理路由配置：
 * 优先级：Worker 内存缓存 (60s) -> Workers KV (PROXY_ROUTES) -> D1 数据库兜底 (并自动回填 KV)
 */
async function resolveRoute(env: Env, prefix: string): Promise<ProxyRouteValue | null> {
  const now = Date.now();
  const cached = memoryRouteCache.get(prefix);
  if (cached && cached.exp > now) {
    return cached.data;
  }

  // 1. 尝试从 Workers KV 获取
  try {
    const kvRoute = await env.PROXY_ROUTES.get<ProxyRouteValue>(prefix, 'json');
    if (kvRoute && kvRoute.origin) {
      memoryRouteCache.set(prefix, { data: kvRoute, exp: now + 60_000 });
      return kvRoute;
    }
  } catch {}

  // 2. KV 未命中时回退查询 D1（支持本地开发及首次种子数据免手动灌 KV）
  try {
    const row = await env.DB.prepare(
      `SELECT prefix, status, origin_url, title, author_name
       FROM subdomains
       WHERE prefix = ? AND status = 'ACTIVE'
       LIMIT 1`
    )
      .bind(prefix)
      .first<Pick<SubdomainRow, 'prefix' | 'status' | 'origin_url' | 'title' | 'author_name'>>();

    if (row && row.origin_url) {
      const routeVal: ProxyRouteValue = {
        origin: row.origin_url,
        status: row.status,
        title: row.title,
        author: row.author_name
      };
      memoryRouteCache.set(prefix, { data: routeVal, exp: now + 60_000 });
      // 异步回写 KV
      env.PROXY_ROUTES.put(prefix, JSON.stringify(routeVal)).catch(() => {});
      return routeVal;
    }
  } catch {}

  memoryRouteCache.set(prefix, { data: null, exp: now + 15_000 });
  return null;
}

/**
 * 全平台零配置边缘反向代理引擎 (Edge Reverse Proxy Engine)
 * 处理所有 https://{prefix}.vibe-show.com/* 请求：
 * - 自动将 Host 重写为源站域名（Vercel / Netlify / GitHub Pages / Lovable / Bolt 均无需绑域名）
 * - 自动拦截 301/302/307/308 Location 重定向并改写回 {prefix}.vibe-show.com
 * - 支持带子路径的源站（如 https://username.github.io/my-repo）
 * - 自动剥离跨子域污染 Set-Cookie 与冲突安全头
 */
export async function handleSubdomainProxy(
  request: Request,
  env: Env,
  prefix: string
): Promise<Response> {
  const domain = env.DOMAIN || 'vibe-show.com';
  const cleanPrefix = prefix.toLowerCase().trim();
  const route = await resolveRoute(env, cleanPrefix);

  const incomingUrl = new URL(request.url);

  // 未认领或未生效的子域名：平滑重定向回主站并自动填入查重框
  if (!route || route.status !== 'ACTIVE' || !route.origin) {
    const mainOrigin = incomingUrl.hostname.endsWith('.localhost')
      ? `${incomingUrl.protocol}//localhost:${incomingUrl.port}`
      : `https://${domain}`;
    return Response.redirect(`${mainOrigin}/?claim=${encodeURIComponent(cleanPrefix)}`, 302);
  }

  let originBase: URL;
  try {
    originBase = new URL(route.origin);
  } catch {
    return new Response('Invalid upstream origin URL configured.', { status: 502 });
  }

  // 智能处理源站子路径拼接（兼容 GitHub Pages https://user.github.io/repo 等场景）
  const basePath = originBase.pathname.replace(/\/$/, '');
  let targetPathname = incomingUrl.pathname;
  if (basePath && !targetPathname.startsWith(basePath + '/') && targetPathname !== basePath) {
    targetPathname =
      basePath + (targetPathname.startsWith('/') ? targetPathname : '/' + targetPathname);
  }
  const targetUrl = new URL(targetPathname + incomingUrl.search, originBase.origin);

  // 构造干净的回源请求头
  const reqHeaders = new Headers(request.headers);
  reqHeaders.set('Host', originBase.host);
  reqHeaders.set('X-Forwarded-Host', incomingUrl.host);
  reqHeaders.set('X-Forwarded-Proto', incomingUrl.protocol.replace(':', ''));
  // 移除 Cloudflare 内部头，避免当源站也在 Cloudflare (如 Pages / Lovable) 时触发 Error 1000 / Loop
  reqHeaders.delete('cf-connecting-ip');
  reqHeaders.delete('cf-ipcountry');
  reqHeaders.delete('cf-ray');
  reqHeaders.delete('cf-visitor');
  reqHeaders.delete('cf-ew-via');

  try {
    const upstreamRes = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: reqHeaders,
      body: ['GET', 'HEAD'].includes(request.method.toUpperCase()) ? null : request.body,
      redirect: 'manual'
    });

    const resHeaders = new Headers(upstreamRes.headers);

    // 拦截 301/302/303/307/308 重定向，防止浏览器地址栏跳回原部署平台丑域名
    const location = resHeaders.get('Location');
    if (location && [301, 302, 303, 307, 308].includes(upstreamRes.status)) {
      try {
        const locUrl = new URL(location, targetUrl);
        if (locUrl.host === originBase.host) {
          locUrl.host = incomingUrl.host;
          locUrl.protocol = incomingUrl.protocol;
          if (basePath && locUrl.pathname.startsWith(basePath)) {
            locUrl.pathname = locUrl.pathname.slice(basePath.length) || '/';
          }
          resHeaders.set('Location', locUrl.toString());
        }
      } catch {}
    }

    // 安全加固：禁止源站通过 Set-Cookie 污染父域名
    resHeaders.delete('Set-Cookie');
    resHeaders.delete('X-Frame-Options');
    resHeaders.set('X-Vibe-Show-Proxy', cleanPrefix);

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: resHeaders
    });
  } catch (err) {
    return new Response(
      `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${cleanPrefix}.${domain} — 源站连接中</title></head>
      <body style="font-family:-apple-system,sans-serif;background:#F5F5F7;color:#1D1D1F;display:flex;align-items:center;justify-content:center;min-height:90vh;margin:0">
        <div style="background:#fff;padding:32px 40px;border-radius:24px;box-shadow:0 10px 30px rgba(0,0,0,.05);max-width:460px;text-align:center">
          <h2 style="margin:0 0 12px;font-size:20px">源站暂时无法响应</h2>
          <p style="color:#6E6E73;font-size:14px;line-height:1.6;margin:0 0 20px">子域名 <code>${cleanPrefix}.${domain}</code> 已生效，但创作者源站（<code>${originBase.host}</code>）当前未响应：${(err as Error).message}</p>
          <a href="https://${domain}" style="display:inline-block;background:#0071E3;color:#fff;text-decoration:none;padding:10px 22px;border-radius:999px;font-size:13px;font-weight:600">返回 vibe-show.com 秀场</a>
        </div>
      </body></html>`,
      {
        status: 502,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      }
    );
  }
}
