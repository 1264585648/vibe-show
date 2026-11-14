// Curated picks: projects by other creators that we recommend. Each entry must be
// approved by the site owner before it is added. Links go to the original site;
// these projects do NOT get a vibe-show subdomain unless the creator applies.
export interface Pick {
  name: string;
  url: string;
  category: 'tool' | 'creative' | 'game';
  zh: string;
  en: string;
  creator: string;
  creatorUrl?: string;
  shot?: string; // path under /picks/
}

// Approved 2026-11-14. Covers: own headless screenshots, except neon-zenith (README hero image
// from github.com/billpwchan/neon-zenith) and weather-fighter (README preview from its repo).
export const picks: Pick[] = [
  {
    name: 'Neon Zenith', url: 'https://zenith.billpwchan.art/', category: 'game',
    zh: '驾驶悬浮车穿越雨夜霓虹九龙的计时赛，用 Claude Code 制作并开源。',
    en: 'Fly a hover car through a rainy neon Kowloon. Built with Claude Code, open source.',
    creator: 'billpwchan', creatorUrl: 'https://github.com/billpwchan/neon-zenith', shot: 'neon-zenith.jpg'
  },
  {
    name: 'Battle Drones', url: 'https://simonw.github.io/battledrones/', category: 'game',
    zh: '手机上也能玩的即时战略游戏，两台设备可以靠声音联机对战。',
    en: 'A mobile-friendly RTS; two nearby devices can duel over sound.',
    creator: 'Simon Willison', creatorUrl: 'https://simonwillison.net', shot: 'battle-drones.png'
  },
  {
    name: '天气战士 Weather Fighter', url: 'https://lolikonnn.github.io/weather-fighter/', category: 'creative',
    zh: '用炒股软件的 K 线界面看天气预报。',
    en: 'A weather forecast dressed up as a stock-trading terminal.',
    creator: 'lolikonnn', creatorUrl: 'https://github.com/lolikonnn/weather-fighter', shot: 'weather-fighter.png'
  },
  {
    name: 'free.tools', url: 'https://free.tools', category: 'tool',
    zh: '60 多个免费、无广告的在线工具，文件都在浏览器本地处理。',
    en: '60+ free, ad-free utilities that run locally in your browser.',
    creator: 'Showfom', creatorUrl: 'https://www.v2ex.com/t/1171101', shot: 'free-tools.png'
  },
  {
    name: "Simon Willison's Tools", url: 'https://tools.simonwillison.net/', category: 'tool',
    zh: '240 多个由大模型生成的单页小工具，每个都附有提示词记录。',
    en: '240+ single-page tools built with LLMs, each with its prompt transcript.',
    creator: 'Simon Willison', creatorUrl: 'https://github.com/simonw/tools', shot: 'simonw-tools.png'
  },
  {
    name: 'GeoSports', url: 'https://geosports.app/', category: 'game',
    zh: '每日体育地理问答：在地图上点出五道题的答案。',
    en: 'A daily sports-geography quiz: pin five answers on the map.',
    creator: 'Frank Michael Smith', creatorUrl: 'https://x.com/frankmikesmith', shot: 'geosports.png'
  },
  {
    name: 'The V2EX Chronicle', url: 'https://v2ex-report.vercel.app', category: 'creative',
    zh: '把 V2EX 帖子变成报纸风格的数据报告。',
    en: 'Turns a V2EX thread into a newspaper-style data report.',
    creator: 'cf-jx', creatorUrl: 'https://github.com/cf-jx/v2ex-report', shot: 'v2ex-chronicle.png'
  },
  {
    name: 'backroad rally', url: 'https://jason-c-dev.github.io/backroad-rally/', category: 'game',
    zh: '微缩景观风格的俯视拉力赛，跨越不同年代、天气和时段。',
    en: 'A top-down diorama rally across eras, weather and times of day.',
    creator: 'jason-c-dev', creatorUrl: 'https://github.com/jason-c-dev/backroad-rally', shot: 'backroad-rally.png'
  }
];
