# vibe-show.com 改版设计（2026-11-14）

## 目标
让 vibe-show.com 看起来像一个可信的创业产品而不是个人作品，既能吸引创作者，也能通过 Google for Startups、Paddle 等审核。

## 已定决策
| 项目 | 决定 |
|---|---|
| 受众 | 中英并重：`/` 中文、`/en/` 英文，首次访问按浏览器语言自动跳转并用 cookie 记住 |
| 申请入口 | 网页表单直接提交 → 进入后台审核队列；小红书降为可选社区渠道 |
| 视觉方向 | C · 作品画廊优先（暖中性色、黑色主按钮、作品卡片为主角） |
| 作品墙数据 | 只用真实作品；作品不足时为半画廊布局 + “提交你的作品”空位 |
| 精选推荐 | 他人优秀作品单独成栏，署名并外链原站，不分配子域名，先由站长审核清单 |
| 技术 | Astro 静态站（`web/`）+ 现有 Worker/D1 后端；Tailwind v4 构建期编译 |
| 诚信 | 删除虚构数字（`417 + items.length`）与示例种子作品，只展示真实数据 |

## 架构
- `web/`：Astro 项目，`output: 'static'`，i18n `defaultLocale: 'zh'`，`locales: ['zh','en']`，中文无前缀。构建产物 `web/dist` 作为 Worker 的 `assets.directory`。
- `web/public/`：原样迁移 `admin.html`、`deals.html`、`tutorials/`、法律页。
- Worker 新增：
  - `/` 语言跳转：无 `lang` cookie 且 `Accept-Language` 首选英文 → 302 到 `/en/`；`?lang=zh|en` 写 cookie。
  - `POST /api/submit`：校验前缀格式/保留字/占用、URL 必须是 https、邮箱格式、单 IP 每小时 5 次；写入 `PENDING_REVIEW`；联系邮箱存入运行时自动创建的 `submission_contacts` 表（避免对线上库跑迁移）。
  - 邮件（可选）：配置 `RESEND_API_KEY` 时发送提交确认、站长通知、审核通过通知；未配置则跳过，不影响提交。
  - `/api/showcase`：`total_claimed` 改为真实 ACTIVE 数量。

## 页面
1. **首页**：导航（Logo、作品、提交、定价、FAQ、语言）→ Hero（标题 + 副标题 + 两个按钮 + 真实作品数）→ 作品墙（分类筛选、真实作品卡片带截图、空位卡片）→ 精选推荐（审核后才有内容，空时整栏隐藏）→ 工作原理三步 → 能力介绍（子域名/秀场/代部署）→ 支持平台 → 定价 → FAQ → 结尾 CTA → 页脚。
2. **提交页 `/submit`**：前缀实时查重、作品信息、邮箱、分类、同意条款 → 成功状态 + 进度查询入口。
3. **进度查询**：提交页内的查询框，调用现有 `/api/applications/status`。
4. 法律页沿用已上线的双语版本。

## 视觉系统
- 色彩：背景 `#FAFAF9`，正文 `#1C1917`，次要 `#57534E`/`#78716C`，边框 `#E7E5E4`，主按钮黑色，强调色橙 `#F97316`（少量用于徽章和高亮）。
- 字体：Inter（英文）+ 系统中文字体；代码与域名用 JetBrains Mono。
- 组件：圆角 12–16px 卡片、细边框、轻阴影；不用 emoji 做图标，改用内联 SVG。
- Logo：方形黑底 + 白色“v”形标志的 SVG。

## 作品截图
`scripts/shots.mjs` 用本机 Chrome 无头模式为每个作品截 1200×750 的图存到 `web/public/shots/{prefix}.webp|png`；没有截图的作品回退为渐变色块 + 首字母。

## 验证
- `astro build` 通过；Worker `tsc` 通过。
- 静态服务器 + 无头 Chrome 截图检查中英文首页、提交页、手机宽度。
- 本机 workerd 无法运行，接口改动通过类型检查与单元级逻辑审阅，上线后用 curl 冒烟测试。

## 上线前需要站长操作
- 在 D1 控制台隐藏示例作品：`UPDATE subdomains SET show_in_gallery = 0 WHERE origin_url LIKE '%-demo.%';`
- （可选）注册 Resend，配置 `RESEND_API_KEY`、`ADMIN_EMAIL` 两个 Secret，并验证 vibe-show.com 发信域名。
- 审核精选推荐清单。
