export type Lang = 'zh' | 'en';

const zh = {
  htmlLang: 'zh-CN',
  meta: {
    title: 'vibe-show — AI 编程作品的展示与发布平台',
    description:
      '提交你用 AI 编程工具做的作品，免费获得 yourname.vibe-show.com 子域名，自动 HTTPS，登上作品墙。也可以让我们帮你部署上线。',
    submitTitle: '提交作品 — vibe-show'
  },
  nav: { projects: '作品', how: '工作原理', pricing: '定价', faq: '常见问题', submit: '提交作品', switchLabel: 'EN', switchTitle: 'English' },
  hero: {
    badge: '为 Vibe Coder 打造',
    title1: 'AI 写出来的作品，',
    title2: '值得被看见',
    sub: '提交你用 Claude、Cursor、Lovable 等工具做的作品，免费获得专属子域名和自动 HTTPS，登上作品墙，被更多人发现。',
    ctaSubmit: '提交作品',
    ctaBrowse: '浏览作品',
    liveCount: (n: number) => `已有 ${n} 个作品上线`,
    works: '支持 Vercel、Netlify、GitHub Pages、Cloudflare Pages、Lovable、Bolt、Replit'
  },
  gallery: {
    eyebrow: '作品墙',
    title: '最近上线的作品',
    all: '全部',
    cats: { tool: '效率工具', creative: '创意玩具', game: '小游戏' } as Record<string, string>,
    featured: '精选',
    visit: '访问',
    by: '作者',
    emptyTitle: '下一个就是你的作品',
    emptyText: '提交作品，审核通过后会出现在这里，并获得专属子域名。',
    emptyCta: '提交作品',
    loading: '正在加载作品…',
    error: '作品暂时加载失败，请稍后刷新。'
  },
  picks: {
    eyebrow: '精选推荐',
    title: '我们喜欢的 AI 编程作品',
    sub: '来自社区的优秀作品，点击直接访问原站。作者如需调整或下架，请发邮件联系我们。'
  },
  how: {
    eyebrow: '工作原理',
    title: '三步上线，不用碰 DNS',
    steps: [
      { t: '提交作品', d: '选一个子域名前缀，填写作品名称、原部署地址和联系邮箱。' },
      { t: '人工审核', d: '我们会检查站点能否正常访问、内容是否合规，通常 24 小时内完成，结果发到你的邮箱。' },
      { t: '正式上线', d: '审核通过后自动生效：yourname.vibe-show.com 开通 HTTPS，作品登上作品墙。' }
    ]
  },
  features: {
    eyebrow: '你能得到什么',
    title: '从“能跑”到“能拿得出手”',
    items: [
      { t: '专属子域名', d: '用 yourname.vibe-show.com 替代又长又难记的部署地址。边缘反向代理，零配置自动 HTTPS。' },
      { t: '作品墙曝光', d: '审核通过的作品按分类展示在首页，优秀作品会被设为精选，让更多人发现。' },
      { t: '代部署服务', d: '只有代码、还没上线？把仓库交给我们，部署到你自己的托管账号并接好子域名。' }
    ]
  },
  pricing: {
    eyebrow: '定价',
    title: '免费起步，按需升级',
    sub: '免费版会一直免费。价格以美元计。',
    soon: '即将开放',
    plans: [
      {
        k: 'free', name: '免费版', price: '$0', unit: '',
        items: ['最多 3 个子域名', '边缘反向代理，自动 HTTPS', '登上作品墙', '24 小时内人工审核'],
        cta: '提交作品', href: 'submit'
      },
      {
        k: 'pro', name: 'Pro 创作者版', price: '$5', unit: '/ 月，或 $48 / 年',
        items: ['包含免费版全部功能', '最多 10 个子域名', '2 小时内优先审核', '作品墙优先展示', '随时取消，首次付款 14 天内可退款'],
        cta: '加入候补名单', href: 'mailto:hi@vibe-show.com?subject=Pro%20waitlist'
      },
      {
        k: 'launch', name: '代部署上线', price: '$29', unit: '/ 每个作品，一次性',
        items: ['部署到 Vercel 或 Cloudflare Pages', '接入专属子域名', '上线检查：HTTPS、移动端、基础 SEO', '含 3 个月 Pro 权益', '开工前可全额退款'],
        cta: '预约代部署', href: 'mailto:hi@vibe-show.com?subject=Launch%20service'
      }
    ],
    note: '需要在 vibe-show 基础上做定制开发？发邮件到 hi@vibe-show.com 按项目报价，单独签约和收款。',
    agree: '付费即表示同意服务条款与退款政策。'
  },
  faq: {
    eyebrow: '常见问题',
    title: '常见问题',
    items: [
      { q: '免费版真的免费吗？', a: '是的。只要作品能正常访问、内容合规，免费子域名就可以一直使用，不会因为推出付费方案而收费。' },
      { q: '需要在部署平台绑定域名或改 DNS 吗？', a: '不需要。我们通过 Cloudflare 边缘反向代理访问你现有的部署地址，你只需要提交作品原链接。' },
      { q: '支持哪些平台？', a: 'Vercel、Netlify、GitHub Pages、Cloudflare Pages、Lovable、Bolt、Replit，以及任何可以公开访问的 HTTPS 网站。' },
      { q: '多久能审核完？怎么知道结果？', a: '通常 24 小时内完成，Pro 用户 2 小时内。结果会发到你提交的邮箱，也可以在提交页输入前缀查询进度。' },
      { q: '哪些内容不允许？', a: '仿冒钓鱼、博彩、色情、恶意软件、垃圾广告和侵权内容。暂不支持指向中国大陆境内未备案的服务器。' }
    ]
  },
  cta: { title: '把你的作品放到它该在的地方', sub: '一分钟提交，审核通过后自动上线。', btn: '提交作品' },
  footer: {
    tagline: 'AI 编程作品的展示与发布平台。',
    product: '产品', legal: '条款', contact: '联系',
    links: { projects: '作品墙', submit: '提交作品', pricing: '定价', status: '查询进度', terms: '服务条款', privacy: '隐私政策', refund: '退款政策', abuse: '举报滥用' },
    rights: '© 2026 vibe-show.com。作品内容由创作者自行负责。'
  },
  submit: {
    eyebrow: '提交作品',
    title: '申请你的专属子域名',
    sub: '填写下面的信息，我们会在 24 小时内审核，结果发到你的邮箱。',
    prefix: '子域名前缀', prefixHint: '3–30 位小写字母、数字或连字符',
    title_: '作品名称', titlePh: '例如 FridgeChef 冰箱菜谱',
    url: '作品当前的部署地址', urlPh: 'https://your-project.vercel.app',
    tagline: '一句话介绍', taglinePh: '这个作品能做什么',
    category: '分类',
    author: '署名', authorPh: '你希望展示的名字或昵称',
    email: '联系邮箱', emailHint: '只用于通知审核结果，不会公开',
    agree: '我已阅读并同意', terms: '服务条款', and: '和', privacy: '隐私政策',
    btn: '提交审核', sending: '提交中…',
    check: {
      checking: '正在查询…', available: '可以使用', taken: '已被占用', locked: '暂时被锁定', reserved: '系统保留，请换一个',
      invalid: '格式不正确', suggest: '可以试试：'
    },
    okTitle: '提交成功',
    okText: (p: string) => `我们已收到 ${p}.vibe-show.com 的申请，审核结果会发到你的邮箱。`,
    errGeneric: '提交失败，请稍后再试。',
    statusTitle: '查询审核进度',
    statusPh: '输入子域名前缀',
    statusBtn: '查询',
    statusNotFound: '没有找到这个前缀的申请。',
    statusMap: { SOFT_LOCKED: '已锁定，待提交', PENDING_REVIEW: '审核中', ACTIVE: '已上线' } as Record<string, string>
  }
};

const en: typeof zh = {
  htmlLang: 'en',
  meta: {
    title: 'vibe-show — Showcase and launch your AI-built projects',
    description:
      'Submit a project you built with AI coding tools, get a free yourname.vibe-show.com subdomain with automatic HTTPS, and get featured on the project wall. Or let us deploy it for you.',
    submitTitle: 'Submit a project — vibe-show'
  },
  nav: { projects: 'Projects', how: 'How it works', pricing: 'Pricing', faq: 'FAQ', submit: 'Submit project', switchLabel: '中文', switchTitle: '中文' },
  hero: {
    badge: 'Built for vibe coders',
    title1: 'Where AI-built projects',
    title2: 'get seen',
    sub: 'Submit what you made with Claude, Cursor, Lovable and friends. Get a free subdomain with automatic HTTPS, a spot on the project wall, and an audience.',
    ctaSubmit: 'Submit your project',
    ctaBrowse: 'Browse projects',
    liveCount: (n: number) => `${n} projects live`,
    works: 'Works with Vercel, Netlify, GitHub Pages, Cloudflare Pages, Lovable, Bolt and Replit'
  },
  gallery: {
    eyebrow: 'Project wall',
    title: 'Recently launched',
    all: 'All',
    cats: { tool: 'Tools', creative: 'Creative', game: 'Games' },
    featured: 'Featured',
    visit: 'Visit',
    by: 'by',
    emptyTitle: 'Your project could be next',
    emptyText: 'Submit it, and once approved it shows up here with its own subdomain.',
    emptyCta: 'Submit a project',
    loading: 'Loading projects…',
    error: "Couldn't load projects. Please refresh in a moment."
  },
  picks: {
    eyebrow: 'Curated picks',
    title: 'AI-built projects we love',
    sub: 'Great work from the community, linked to the original sites. Creators can email us to update or remove a listing.'
  },
  how: {
    eyebrow: 'How it works',
    title: 'Live in three steps, no DNS required',
    steps: [
      { t: 'Submit', d: 'Pick a subdomain prefix and tell us the project name, where it is hosted and your email.' },
      { t: 'Review', d: 'We check that the site loads and follows our rules, usually within 24 hours, and email you the result.' },
      { t: 'Go live', d: 'yourname.vibe-show.com gets HTTPS automatically and your project joins the wall.' }
    ]
  },
  features: {
    eyebrow: 'What you get',
    title: 'From “it runs” to “ready to share”',
    items: [
      { t: 'Your own subdomain', d: 'Swap a long deployment URL for yourname.vibe-show.com. Edge reverse proxy, zero-config HTTPS.' },
      { t: 'A place on the wall', d: 'Approved projects are listed by category on the homepage, and standout work gets featured.' },
      { t: 'Deployment service', d: 'Got code but no deployment? Hand us the repo and we ship it to a host you own, subdomain included.' }
    ]
  },
  pricing: {
    eyebrow: 'Pricing',
    title: 'Start free, upgrade when you need more',
    sub: 'The free plan stays free. Prices in USD.',
    soon: 'Coming soon',
    plans: [
      {
        k: 'free', name: 'Free', price: '$0', unit: '',
        items: ['Up to 3 subdomains', 'Edge proxy with automatic HTTPS', 'Listed on the project wall', 'Review within 24 hours'],
        cta: 'Submit a project', href: 'submit'
      },
      {
        k: 'pro', name: 'Pro Creator', price: '$5', unit: '/ month, or $48 / year',
        items: ['Everything in Free', 'Up to 10 subdomains', 'Priority review within 2 hours', 'Priority placement on the wall', 'Cancel anytime, 14-day refund on first payment'],
        cta: 'Join the waitlist', href: 'mailto:hi@vibe-show.com?subject=Pro%20waitlist'
      },
      {
        k: 'launch', name: 'Launch service', price: '$29', unit: '/ project, one-time',
        items: ['Deploy to Vercel or Cloudflare Pages', 'Connect your subdomain', 'Launch check: HTTPS, mobile, basic SEO', 'Includes 3 months of Pro', 'Full refund before work starts'],
        cta: 'Book a launch', href: 'mailto:hi@vibe-show.com?subject=Launch%20service'
      }
    ],
    note: 'Need custom development on top of vibe-show? Email hi@vibe-show.com for a quote; it is contracted and billed separately.',
    agree: 'Paying means you agree to our Terms and Refund Policy.'
  },
  faq: {
    eyebrow: 'FAQ',
    title: 'Questions, answered',
    items: [
      { q: 'Is the free plan really free?', a: 'Yes. Free subdomains stay free as long as your project is reachable and follows our rules.' },
      { q: 'Do I need to configure DNS or a custom domain on my host?', a: 'No. Our Cloudflare edge proxy serves your existing deployment at your subdomain. You only send us the URL.' },
      { q: 'Which hosts are supported?', a: 'Vercel, Netlify, GitHub Pages, Cloudflare Pages, Lovable, Bolt, Replit and any public HTTPS site.' },
      { q: 'How long does review take?', a: 'Usually within 24 hours (2 hours on Pro). We email you the result, and you can check status on the submit page.' },
      { q: "What isn't allowed?", a: 'Phishing, gambling, adult content, malware, spam and anything that infringes on others’ rights.' }
    ]
  },
  cta: { title: 'Give your project the address it deserves', sub: 'Submit in a minute. It goes live as soon as it is approved.', btn: 'Submit your project' },
  footer: {
    tagline: 'The showcase and launch platform for AI-built projects.',
    product: 'Product', legal: 'Legal', contact: 'Contact',
    links: { projects: 'Project wall', submit: 'Submit', pricing: 'Pricing', status: 'Check status', terms: 'Terms', privacy: 'Privacy', refund: 'Refunds', abuse: 'Report abuse' },
    rights: '© 2026 vibe-show.com. Creators are responsible for their own content.'
  },
  submit: {
    eyebrow: 'Submit',
    title: 'Claim your subdomain',
    sub: 'Fill in the details below. We review within 24 hours and email you the result.',
    prefix: 'Subdomain prefix', prefixHint: '3–30 lowercase letters, digits or hyphens',
    title_: 'Project name', titlePh: 'e.g. FridgeChef',
    url: 'Where it is hosted now', urlPh: 'https://your-project.vercel.app',
    tagline: 'One-line description', taglinePh: 'What does it do?',
    category: 'Category',
    author: 'Display name', authorPh: 'Name or handle to show',
    email: 'Contact email', emailHint: 'Only used to send review results. Never shown publicly.',
    agree: 'I agree to the', terms: 'Terms of Service', and: 'and', privacy: 'Privacy Policy',
    btn: 'Submit for review', sending: 'Submitting…',
    check: {
      checking: 'Checking…', available: 'Available', taken: 'Already taken', locked: 'Temporarily reserved', reserved: 'Reserved, try another',
      invalid: 'Invalid format', suggest: 'Try:'
    },
    okTitle: 'Submitted',
    okText: (p: string) => `We received your request for ${p}.vibe-show.com and will email you the result.`,
    errGeneric: 'Something went wrong. Please try again.',
    statusTitle: 'Check review status',
    statusPh: 'Your subdomain prefix',
    statusBtn: 'Check',
    statusNotFound: 'No request found for this prefix.',
    statusMap: { SOFT_LOCKED: 'Reserved, not submitted', PENDING_REVIEW: 'In review', ACTIVE: 'Live' }
  }
};

export const strings = { zh, en };
export const t = (lang: Lang) => strings[lang];
export const base = (lang: Lang) => (lang === 'en' ? '/en/' : '/');
export const altPath = (lang: Lang, path = '') => (lang === 'en' ? `/${path}` : `/en/${path}`);
