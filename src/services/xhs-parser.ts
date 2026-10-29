export interface ParsedXhsComment {
  prefix: string;
  title: string;
  origin_url: string;
  author_name: string;
  platform: string;
}

export interface OriginPreflightResult {
  reachable: boolean;
  http_status: number | null;
  detected_title: string;
  detected_description: string;
  detected_platform: string;
  compliance_ok: boolean;
  compliance_warning: string | null;
}

/**
 * 根据源站 URL 自动识别托管平台名称
 */
export function detectPlatformFromUrl(urlStr: string): string {
  const lower = (urlStr || '').toLowerCase();
  if (lower.includes('.vercel.app')) return 'Vercel';
  if (lower.includes('.netlify.app')) return 'Netlify';
  if (lower.includes('.github.io')) return 'GitHub Pages';
  if (lower.includes('.pages.dev')) return 'Cloudflare Pages';
  if (lower.includes('.lovable.app') || lower.includes('lovable.dev')) return 'Lovable';
  if (lower.includes('.bolt.new') || lower.includes('stackblitz')) return 'Bolt';
  if (lower.includes('.replit.app') || lower.includes('.repl.co')) return 'Replit';
  if (lower.includes('.zeabur.app')) return 'Zeabur';
  return 'Web';
}

/**
 * 解析运营从「小红书评论区」复制的留言文本
 * 支持标准口令格式与自由留言格式：
 *   @星河Coder
 *   #申请子域名 notes
 *   作品：CyberNotes 灵感笔记
 *   链接：https://my-notes.vercel.app
 */
export function parseXhsComment(rawText: string): ParsedXhsComment {
  const raw = (rawText || '').trim();

  // 1. 提取子域名前缀
  const prefixMatch =
    raw.match(/#申请子域名\s+([a-z0-9-]{3,30})/i) ||
    raw.match(/([a-z0-9-]{3,30})\.vibe-show\.com/i) ||
    raw.match(/前缀[:：\s]+([a-z0-9-]{3,30})/i);
  const prefix = prefixMatch
    ? prefixMatch[1].toLowerCase().replace(/[^a-z0-9-]/g, '')
    : '';

  // 2. 提取作品名称
  const titleMatch = raw.match(/(?:作品|名称|项目)[:：]\s*([^\n\r]+)/);
  const title = titleMatch ? titleMatch[1].trim().slice(0, 30) : '';

  // 3. 提取源站 URL
  const urlMatch = raw.match(/https?:\/\/[^\s"'<>，。；！）)]+/i);
  const origin_url = urlMatch ? urlMatch[0].trim() : '';

  // 4. 提取作者昵称（匹配 @xxx 或首行非标签文本）
  let author_name = '';
  const atMatch = raw.match(/@([\u4e00-\u9fa5\w\-_]{1,24})/);
  if (atMatch) {
    author_name = `@${atMatch[1]}`;
  } else {
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const firstLine = lines[0] || '';
    if (
      firstLine &&
      !firstLine.startsWith('#') &&
      !firstLine.includes('作品：') &&
      !firstLine.includes('链接：') &&
      !/^https?:\/\//i.test(firstLine) &&
      firstLine.length <= 24
    ) {
      author_name = firstLine.startsWith('@') ? firstLine : `@${firstLine}`;
    }
  }

  return {
    prefix,
    title,
    origin_url,
    author_name,
    platform: detectPlatformFromUrl(origin_url)
  };
}

/**
 * 审核前对源站 URL 执行连通性、元数据提取与中国大陆未备案源站合规预检
 */
export async function preflightCheckOrigin(urlStr: string): Promise<OriginPreflightResult> {
  if (!urlStr) {
    return {
      reachable: false,
      http_status: null,
      detected_title: '',
      detected_description: '',
      detected_platform: 'Web',
      compliance_ok: false,
      compliance_warning: '未提供源站 URL'
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return {
      reachable: false,
      http_status: null,
      detected_title: '',
      detected_description: '',
      detected_platform: 'Web',
      compliance_ok: false,
      compliance_warning: '源站 URL 格式非法'
    };
  }

  const host = parsed.hostname.toLowerCase();
  const detected_platform = detectPlatformFromUrl(urlStr);

  // 合规校验：拦截 .cn / .com.cn 等中国大陆后缀或内网地址
  if (
    host.endsWith('.cn') ||
    host === 'localhost' ||
    host.startsWith('127.') ||
    host.startsWith('192.168.') ||
    host.startsWith('10.')
  ) {
    return {
      reachable: false,
      http_status: null,
      detected_title: '',
      detected_description: '',
      detected_platform,
      compliance_ok: false,
      compliance_warning: `源站域名 (${host}) 疑似中国大陆境内或本地内网地址，不符合海外免备案接入规范`
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(parsed.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'vibe-show-preflight/2.0 (+https://vibe-show.com)'
      },
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(timeout);

    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([^<]{1,80})<\/title>/i);
    const descMatch =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,120})["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']{1,120})["'][^>]+name=["']description["']/i);

    // 检查是否命中平台“未认领/站点不存在”特征
    const takeoverHints = [
      "There isn't a GitHub Pages site here",
      'DEPLOYMENT_NOT_FOUND',
      'Not Found - Request ID:'
    ];
    const hitDeadHint = takeoverHints.some((hint) => html.includes(hint));

    return {
      reachable: res.ok && !hitDeadHint,
      http_status: res.status,
      detected_title: titleMatch ? titleMatch[1].trim() : '',
      detected_description: descMatch ? descMatch[1].trim() : '',
      detected_platform,
      compliance_ok: true,
      compliance_warning: hitDeadHint
        ? '源站返回托管平台 404 未部署特征，请确认链接是否正确'
        : null
    };
  } catch (err) {
    return {
      reachable: false,
      http_status: null,
      detected_title: '',
      detected_description: '',
      detected_platform,
      compliance_ok: true,
      compliance_warning: `源站探测超时或无法连接: ${(err as Error).message}`
    };
  }
}
