import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './types';
import { publicRoutes } from './routes/public';
import { adminRoutes } from './routes/admin';
import { handleSubdomainProxy } from './proxy';
import { runScheduledTasks } from './services/cron';

const app = new Hono<{ Bindings: Env }>();

// 允许跨域调用（方便本地前端预览或调试）
app.use('/api/*', cors());

// 挂载公开 API 与管理员 API
app.route('/api', publicRoutes);
app.route('/api/admin', adminRoutes);

// 健康检查接口
app.get('/api/health', (c) =>
  c.json({
    ok: true,
    service: 'vibe-show-edge-worker',
    domain: c.env.DOMAIN || 'vibe-show.com',
    timestamp: new Date().toISOString()
  })
);

/**
 * 识别请求是否属于创作者子域名（如 https://tarot.vibe-show.com 或本地 http://tarot.localhost:8787）
 */
function extractSubdomainPrefix(hostname: string, rootDomain: string): string | null {
  const host = hostname.toLowerCase();

  // 1. 生产环境 *.vibe-show.com
  if (host.endsWith(`.${rootDomain}`)) {
    const sub = host.slice(0, -(rootDomain.length + 1));
    if (sub && sub !== 'www' && !sub.includes('.')) {
      return sub;
    }
  }

  // 2. 本地联调环境 *.localhost (如 tarot.localhost:8787)
  if (host.endsWith('.localhost')) {
    const sub = host.slice(0, -'.localhost'.length);
    if (sub && sub !== 'www' && !sub.includes('.')) {
      return sub;
    }
  }

  return null;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const rootDomain = env.DOMAIN || 'vibe-show.com';

    // A. 支持本地通过 /__proxy/{prefix}/... 快速测试边缘反向代理效果
    if (url.pathname.startsWith('/__proxy/')) {
      const parts = url.pathname.split('/').filter(Boolean); // ['__proxy', prefix, ...rest]
      const prefix = parts[1];
      if (prefix) {
        const restPath = '/' + parts.slice(2).join('/');
        const rewrittenUrl = new URL(restPath + url.search, url.origin);
        const proxyReq = new Request(rewrittenUrl.toString(), request);
        return handleSubdomainProxy(proxyReq, env, prefix);
      }
    }

    // B. 数据面：若当前访问的是 {prefix}.vibe-show.com 或 {prefix}.localhost，直接进入边缘反向代理引擎
    const subPrefix = extractSubdomainPrefix(url.hostname, rootDomain);
    if (subPrefix) {
      return handleSubdomainProxy(request, env, subPrefix);
    }

    // C. 控制面：/api/* 请求交给 Hono 处理
    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx);
    }

    // D. 快捷后台路由：访问 /admin 自动返回 /admin.html
    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      const adminUrl = new URL('/admin.html', request.url);
      return env.ASSETS.fetch(new Request(adminUrl.toString(), request));
    }

    // E. 静态资源层：返回 public/index.html 等静态文件
    return env.ASSETS.fetch(request);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduledTasks(env));
  }
};
