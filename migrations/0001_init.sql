-- ============================================================================
-- vibe-show.com D1 Database Schema & Initial Seed (migrations/0001_init.sql)
-- ============================================================================

-- 1. 子域名生命周期主表
CREATE TABLE IF NOT EXISTS subdomains (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    prefix              TEXT NOT NULL UNIQUE,               -- 唯一子域名前缀，如 'tarot'
    status              TEXT NOT NULL DEFAULT 'SOFT_LOCKED',-- 状态: SOFT_LOCKED / PENDING_REVIEW / ACTIVE / REJECTED / REVOKED

    -- 源站与反向代理配置
    platform            TEXT NOT NULL DEFAULT 'vercel',     -- 平台: vercel / netlify / github / cloudflare / lovable / bolt / other
    origin_url          TEXT NOT NULL DEFAULT '',           -- 创作者原始作品地址，如 https://my-tarot.vercel.app
    cf_record_id        TEXT,                               -- Cloudflare DNS API 返回的 Record ID（用于回收时精准删除）

    -- 秀场展示元数据
    title               TEXT NOT NULL DEFAULT '',           -- 作品名称（<=30字）
    category            TEXT NOT NULL DEFAULT 'tool',       -- 分类: tool(效率工具) / creative(创意玩具) / game(独立小游戏)
    stack               TEXT NOT NULL DEFAULT 'AI + Web',   -- 技术栈标签，如 'Claude + Cursor'
    tagline             TEXT NOT NULL DEFAULT '',           -- 一句话简介（<=40字）
    author_name         TEXT NOT NULL DEFAULT '',           -- 创作者署名 / 小红书昵称（如 '@星河Coder'）
    xhs_comment_raw     TEXT,                               -- 原始小红书评论备份
    theme_bg            TEXT NOT NULL DEFAULT 'from-[#EDF5FF] via-[#E3EFFE] to-[#D5E6FB]',
    is_dark             INTEGER NOT NULL DEFAULT 0,         -- 深色卡片模式: 0 / 1
    is_featured         INTEGER NOT NULL DEFAULT 0,         -- 是否「★ 本周精选」: 0 / 1
    show_in_gallery     INTEGER NOT NULL DEFAULT 1,         -- 是否在首页秀场展示: 0 / 1

    -- 软锁号与防刷追踪
    client_token        TEXT,                               -- 网页端匿名会话标识（允许本人重复修改口令）
    client_ip_hash      TEXT,                               -- 客户端 IP 哈希（限制单 IP 每小时软锁次数）
    lock_expires_at     DATETIME,                           -- 软锁号过期时间（当前时间 + 2 小时）

    -- 审核与健康巡检追踪
    status_note         TEXT,                               -- 面向用户进度查询展示的提示语
    fail_streak         INTEGER NOT NULL DEFAULT 0,         -- 连续健康巡检失败天数（满 30 天自动回收）
    last_http_status    INTEGER,                            -- 最近一次源站探测 HTTP 状态码
    approved_at         DATETIME,                           -- 审核通过并上线时间
    last_checked_at     DATETIME,                           -- 最近一次 Cron 巡检时间
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subdomains_status_gallery ON subdomains(status, show_in_gallery, is_featured, approved_at DESC);
CREATE INDEX IF NOT EXISTS idx_subdomains_lock_expires ON subdomains(status, lock_expires_at);
CREATE INDEX IF NOT EXISTS idx_subdomains_author ON subdomains(author_name);
CREATE INDEX IF NOT EXISTS idx_subdomains_ip_hash ON subdomains(client_ip_hash, created_at);

-- 2. 系统保留字表
CREATE TABLE IF NOT EXISTS reserved_words (
    word                TEXT PRIMARY KEY,
    reason              TEXT NOT NULL DEFAULT 'SYSTEM',
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO reserved_words (word) VALUES
('www'),('api'),('admin'),('app'),('mail'),('smtp'),('imap'),('pop'),('mx'),('ns1'),('ns2'),
('cdn'),('static'),('assets'),('img'),('docs'),('blog'),('status'),('help'),('support'),
('dev'),('test'),('staging'),('auth'),('login'),('account'),('pay'),('billing'),('official'),
('vibe'),('show'),('root'),('dashboard'),('console'),('security'),('abuse'),('edge'),('proxy');

-- 3. 审计与操作日志表
CREATE TABLE IF NOT EXISTS audit_logs (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    prefix              TEXT NOT NULL,
    action              TEXT NOT NULL,                      -- SOFT_LOCK / APPROVE / REJECT / REVOKE / AUTO_EXPIRE
    detail              TEXT,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. 种子作品数据（与前端 11 个初始精选作品一致，开箱即用）
INSERT OR IGNORE INTO subdomains (
    prefix, status, platform, origin_url, title, category, stack, tagline, author_name,
    theme_bg, is_dark, is_featured, show_in_gallery, status_note, approved_at
) VALUES
('tarot', 'ACTIVE', 'Vercel', 'https://cybertarot-demo.vercel.app', 'CyberTarot 赛博塔罗', 'creative', 'Claude + Cursor', '融合荣格心理学与大模型的每日星象牌阵', '@星河Coder', 'from-[#16181D] via-[#1E222B] to-[#121418]', 1, 1, 1, '已上线，全球 HTTPS 边缘反代已生效，作品已登上首页秀场。', datetime('now', '-10 days')),
('focus', 'ACTIVE', 'Vercel', 'https://zenfocus-demo.vercel.app', 'ZenFocus 极简心流钟', 'tool', 'v0 + Next.js', '带合成器环境音的沉浸式番茄工作台', '@林深Vibe', 'from-[#EDF5FF] via-[#E3EFFE] to-[#D5E6FB]', 0, 0, 1, '已上线，全球 HTTPS 边缘反代已生效，作品已登上首页秀场。', datetime('now', '-9 days')),
('pixel', 'ACTIVE', 'Lovable', 'https://pixelpet-demo.lovable.app', 'PixelPet 像素灵感工坊', 'creative', 'Lovable + Canvas', '一句话生成会呼吸的 8-bit 桌面电子宠物', '@Momo_AI', 'from-[#FFF6EB] via-[#FFEBD6] to-[#FDE0C2]', 0, 0, 1, '已上线，全球 HTTPS 边缘反代已生效，作品已登上首页秀场。', datetime('now', '-8 days')),
('synth', 'ACTIVE', 'Cloudflare Pages', 'https://pocketsynth-demo.pages.dev', 'PocketSynth 口袋合成器', 'game', 'WebAudio + Gemini', '基于 WebAudio 纯代码生成的复古电子琴', '@Kev_Audio', 'from-[#F2F3F5] via-[#E6E8EC] to-[#DADCE2]', 0, 0, 1, '已上线，全球 HTTPS 边缘反代已生效，作品已登上首页秀场。', datetime('now', '-7 days')),
('bill', 'ACTIVE', 'Vercel', 'https://moodbill-demo.vercel.app', 'MoodBill 情绪热敏小票', 'tool', 'Cursor + React', '把今日歌单与待办打印成复古超市账单', '@阿泽Design', 'from-[#E6F8F1] via-[#D3F3E6] to-[#BCEAD8]', 0, 0, 1, '已上线，全球 HTTPS 边缘反代已生效，作品已登上首页秀场。', datetime('now', '-6 days')),
('haiku', 'ACTIVE', 'GitHub Pages', 'https://codehaiku-demo.github.io', 'CodeHaiku 代码俳句诗社', 'creative', 'Claude 3.7 + Astro', '把你的 Git Commit 提交记录谱写成日式俳句', '@小野Vibe', 'from-[#F7F4EE] via-[#EFE9DD] to-[#E5DEC9]', 0, 0, 1, '已上线，全球 HTTPS 边缘反代已生效，作品已登上首页秀场。', datetime('now', '-5 days')),
('kanban', 'ACTIVE', 'Bolt', 'https://monoboard-demo.bolt.new', 'MonoBoard 极简灵感看板', 'tool', 'Bolt + Supabase', '支持键盘快捷键流转的个人独立开发排期表', '@Jun_Dev', 'from-[#F1F5F9] via-[#E2E8F0] to-[#CBD5E1]', 0, 0, 1, '已上线，全球 HTTPS 边缘反代已生效，作品已登上首页秀场。', datetime('now', '-4 days')),
('maze', 'ACTIVE', 'Vercel', 'https://gravitymaze-demo.vercel.app', 'GravityMaze 重力迷宫弹珠', 'game', 'Cursor + Three.js', '跟随触控板倾角滚动的微缩极简物理迷宫', '@Leo_3D', 'from-[#ECFEFF] via-[#CFFAFE] to-[#A5F3FC]', 0, 0, 1, '已上线，全球 HTTPS 边缘反代已生效，作品已登上首页秀场。', datetime('now', '-3 days')),
('lofi', 'ACTIVE', 'Vercel', 'https://lofidesk-demo.vercel.app', 'LofiDesk 深夜书房混音台', 'creative', 'v0 + WebAudio', '自由调节壁炉柴火、雨滴与黑胶底噪比例', '@Mia_Sound', 'from-[#1F2421] via-[#272D2A] to-[#181C1A]', 1, 0, 1, '已上线，全球 HTTPS 边缘反代已生效，作品已登上首页秀场。', datetime('now', '-2 days')),
('recipe', 'ACTIVE', 'Netlify', 'https://fridgechef-demo.netlify.app', 'FridgeChef 冰箱清库存指南', 'tool', 'Claude + Tailwind', '勾选剩余食材，10 秒生成一人食快手菜谱', '@吃饱写代码', 'from-[#FEFCE8] via-[#FEF9C3] to-[#FEF08A]', 0, 0, 1, '已上线，全球 HTTPS 边缘反代已生效，作品已登上首页秀场。', datetime('now', '-1 days')),
('typing', 'ACTIVE', 'Cloudflare Pages', 'https://keyrhythm-demo.pages.dev', 'KeyRhythm 机械轴体音游', 'game', 'Windsurf + Vite', '还原茶轴与段落轴清脆声学反馈的盲打竞速', '@KeyMaster', 'from-[#F3F4F6] via-[#E5E7EB] to-[#D1D5DB]', 0, 0, 1, '已上线，全球 HTTPS 边缘反代已生效，作品已登上首页秀场。', datetime('now'));
