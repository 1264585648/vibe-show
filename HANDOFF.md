# vibe-show 交接与项目说明（2026-10-29 v2.0）

## 一、 核心架构演进（已完成前后端全套落地）

1. **申请通道：网页 2h 软锁号 + 小红书评论区一键解析闭环**
   - 用户在首屏实时查重（`GET /api/prefix/check`）并点击「复制口令并前往小红书留言」时，自动调用 `POST /api/prefix/soft-lock` 将该前缀置为 `SOFT_LOCKED` 状态保护 2 小时，并暂存预填的作品名与源站链接草稿。
   - 运营在轻量后台 [`/admin` (`public/admin.html`)](file:///d:/vibe-projects/vibe-show/public/admin.html) 粘贴小红书评论原文，后端自动提取 `#申请子域名`、作品名、源站 URL 与 `@作者昵称`，合并软锁草稿并执行源站连通性与合规预检。
2. **DNS 生效与部署：全平台统一 Cloudflare Worker 边缘反代（创作者 0 配置）**
   - 无论作品部署在 Vercel、Netlify、GitHub Pages、Cloudflare Pages 还是 Lovable、Bolt、Replit，创作者**均无需在平台后台绑定自定义域名**。
   - 运营点击「一键审核通过」后，系统自动调用 Cloudflare DNS API 创建 `{prefix}.vibe-show.com` 的 Proxied 记录，并将路由写入 Workers KV (`PROXY_ROUTES`)，依托 Cloudflare Universal SSL 实现全球秒级 HTTPS 生效。

---

## 二、 交付文件清单

| 文件 / 目录 | 路径 | 说明 |
|------|------|------|
| **主站落地页** | `D:\vibe-projects\vibe-show\index.html` (`public/index.html`) | Apple 工业克制风落地页，已对接 `/api/*` 真实接口并支持本地 `file://` 自动降级演示 |
| **运营审核后台** | `D:\vibe-projects\vibe-show\public\admin.html` | 小红书评论粘贴一键解析、源站预检、一键放行写 DNS + 生成小红书回帖话术控制台 |
| **Worker 统一入口** | `D:\vibe-projects\vibe-show\src\index.ts` | 基于 Host 智能分流主站 API/静态页面与 `*.vibe-show.com` 边缘反向代理 |
| **边缘反代引擎** | `D:\vibe-projects\vibe-show\src\proxy.ts` | 支持 60s 内存缓存 + KV 路由、Host 重写、301/302 防跳回、子路径映射与安全清洗 |
| **公开与管理 API** | `D:\vibe-projects\vibe-show\src\routes\public.ts`, `admin.ts` | 查重、2h 软锁号、4 阶段进度查询、秀场接口与后台管理接口 |
| **DNS 与评论解析服务** | `D:\vibe-projects\vibe-show\src\services\cf-dns.ts`, `xhs-parser.ts`, `cron.ts` | Cloudflare DNS API 封装、小红书口令解析 + 源站预检、定时清理过期锁号与死链巡检 |
| **数据库迁移与种子** | `D:\vibe-projects\vibe-show\migrations\0001_init.sql` | Cloudflare D1 表结构、系统保留字与初始 11 个精选作品种子数据 |
| **需求与技术文档** | `REQUIREMENTS.md`, `TECHNICAL_DESIGN.md` | v2.0 完整产品需求与技术方案文档 |
