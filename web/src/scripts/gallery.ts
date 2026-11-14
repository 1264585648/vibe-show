interface Item {
  prefix: string;
  category: string;
  stack: string;
  featured: boolean;
  title: string;
  tagline: string;
  author: string;
}

interface I18n {
  cats: Record<string, string>;
  featured: string;
  visit: string;
  by: string;
  emptyTitle: string;
  emptyText: string;
  emptyCta: string;
  error: string;
  liveCount: string;
  submitHref: string;
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

const palettes = [
  ['#FDE68A', '#F97316'], ['#A7F3D0', '#0EA5E9'], ['#DDD6FE', '#EC4899'],
  ['#BFDBFE', '#6366F1'], ['#FECACA', '#EF4444'], ['#D9F99D', '#16A34A']
];

function gradientFor(prefix: string) {
  let h = 0;
  for (const ch of prefix) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [a, b] = palettes[h % palettes.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

async function loadShowcase(): Promise<{ items: Item[]; total_claimed: number }> {
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  const urls = isLocal ? ['https://vibe-show.com/api/showcase'] : ['/api/showcase'];
  for (const u of urls) {
    const res = await fetch(u, { headers: { accept: 'application/json' } });
    if (res.ok) return res.json();
  }
  throw new Error('showcase unavailable');
}

function card(item: Item, i18n: I18n) {
  const href = `https://${encodeURIComponent(item.prefix)}.vibe-show.com`;
  const initial = esc((item.title || item.prefix).trim().charAt(0).toUpperCase());
  return `
  <a href="${href}" target="_blank" rel="noopener" data-cat="${esc(item.category)}"
     class="gallery-item card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-12px_rgba(28,25,23,0.25)]">
    <div class="relative aspect-[16/10] overflow-hidden border-b border-line" style="background:${gradientFor(item.prefix)}">
      <span class="absolute inset-0 flex items-center justify-center text-5xl font-extrabold text-white/80">${initial}</span>
      <img src="/shots/${esc(item.prefix)}.png" alt="" loading="lazy"
           class="absolute inset-0 h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.02]"
           onerror="this.remove()">
      ${item.featured ? `<span class="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-0.5 text-[11px] font-semibold text-ink shadow-sm">★ ${esc(i18n.featured)}</span>` : ''}
    </div>
    <div class="flex flex-1 flex-col p-5">
      <div class="flex items-center justify-between gap-3">
        <h3 class="truncate text-base font-semibold">${esc(item.title || item.prefix)}</h3>
        <span class="shrink-0 rounded-full bg-paper px-2 py-0.5 text-[11px] font-medium text-ink-3">${esc(i18n.cats[item.category] || item.category)}</span>
      </div>
      <p class="mt-1.5 line-clamp-2 text-sm text-ink-3">${esc(item.tagline)}</p>
      <div class="mt-auto flex items-center justify-between pt-4 text-xs text-ink-3">
        <span class="truncate font-mono">${esc(item.prefix)}.vibe-show.com</span>
        <span class="shrink-0 font-medium text-ink group-hover:text-accent">${esc(i18n.visit)} →</span>
      </div>
    </div>
  </a>`;
}

function emptyTile(i18n: I18n, span: number) {
  const spanCls = span >= 3 ? 'lg:col-span-3' : span === 2 ? 'lg:col-span-2' : '';
  return `
  <a href="${esc(i18n.submitHref)}" class="gallery-empty ${spanCls} flex min-h-[220px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line-2 p-8 text-center transition hover:border-ink">
    <span class="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-2xl leading-none text-white">+</span>
    <p class="mt-4 text-base font-semibold">${esc(i18n.emptyTitle)}</p>
    <p class="mt-1.5 max-w-sm text-sm text-ink-3">${esc(i18n.emptyText)}</p>
    <span class="mt-4 text-sm font-semibold text-accent">${esc(i18n.emptyCta)} →</span>
  </a>`;
}

export async function initGallery() {
  const root = document.getElementById('gallery');
  const cfg = document.getElementById('gallery-i18n');
  if (!root || !cfg) return;
  const i18n: I18n = JSON.parse(cfg.textContent || '{}');

  let items: Item[] = [];
  try {
    const data = await loadShowcase();
    items = data.items || [];
    const count = document.getElementById('live-count');
    if (count && data.total_claimed > 0) count.textContent = i18n.liveCount.replace('{n}', String(data.total_claimed));
  } catch {
    root.innerHTML = `<p class="col-span-full text-sm text-ink-3">${esc(i18n.error)}</p>`;
    return;
  }

  const render = (cat: string) => {
    const shown = cat === 'all' ? items : items.filter((it) => it.category === cat);
    const rest = 3 - (shown.length % 3);
    root.innerHTML = shown.map((it) => card(it, i18n)).join('') + emptyTile(i18n, rest === 0 ? 3 : rest);
  };
  render('all');

  document.querySelectorAll<HTMLButtonElement>('#cat-filter .cat-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#cat-filter .cat-btn').forEach((b) => b.classList.remove('!border-ink', '!bg-ink', '!text-white'));
      btn.classList.add('!border-ink', '!bg-ink', '!text-white');
      render(btn.dataset.cat || 'all');
    });
  });
}
