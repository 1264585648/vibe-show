-- 注册「羊毛传说」(https://free.vibe-show.com) 到首页作品墙与保留字列表
INSERT OR IGNORE INTO reserved_words (word, reason)
VALUES ('free', 'OFFICIAL_SUBSITE');

INSERT INTO subdomains (
    prefix, status, platform, origin_url, cf_record_id,
    title, category, stack, tagline, author_name,
    theme_bg, is_dark, is_featured, show_in_gallery,
    status_note, approved_at, updated_at
) VALUES (
    'free',
    'ACTIVE',
    'Cloudflare Workers',
    'https://free.vibe-show.com',
    'dryrun_external_dealdex',
    '羊毛传说',
    'creative',
    'Cloudflare Workers + D1',
    '开卡包抽卡发现云服务器、AI 福利、工具与教育优惠',
    '@vibe-show',
    'from-[#1A1D2E] via-[#222842] to-[#131726]',
    1,
    0,
    1,
    '官方项目已上线，由独立 Worker 托管于 https://free.vibe-show.com。',
    datetime('now'),
    datetime('now')
)
ON CONFLICT(prefix) DO UPDATE SET
    status = 'ACTIVE',
    platform = excluded.platform,
    origin_url = excluded.origin_url,
    cf_record_id = excluded.cf_record_id,
    title = excluded.title,
    category = excluded.category,
    stack = excluded.stack,
    tagline = excluded.tagline,
    author_name = excluded.author_name,
    theme_bg = excluded.theme_bg,
    is_dark = excluded.is_dark,
    is_featured = excluded.is_featured,
    show_in_gallery = 1,
    status_note = excluded.status_note,
    approved_at = COALESCE(subdomains.approved_at, datetime('now')),
    updated_at = datetime('now');
