interface I18n {
  check: Record<string, string>;
  sending: string;
  btn: string;
  errGeneric: string;
  okText: string;
  statusNotFound: string;
  statusMap: Record<string, string>;
  lang: 'zh' | 'en';
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const sanitize = (v: string) => v.toLowerCase().replace(/[^a-z0-9-]/g, '');

export function initSubmit() {
  const i18n: I18n = JSON.parse($('submit-i18n').textContent || '{}');
  const form = $<HTMLFormElement>('submit-form');
  const prefix = $<HTMLInputElement>('f-prefix');
  const status = $('prefix-status');
  const errBox = $('form-error');
  const btn = $<HTMLButtonElement>('submit-btn');
  const hint = status.textContent || '';
  let timer: number | undefined;
  let lastState = '';

  const showStatus = (text: string, tone: 'ok' | 'bad' | 'muted') => {
    status.textContent = text;
    status.className = `mt-1.5 min-h-[18px] text-xs ${tone === 'ok' ? 'text-green-700' : tone === 'bad' ? 'text-red-600' : 'text-ink-3'}`;
  };

  async function check() {
    const p = sanitize(prefix.value);
    if (prefix.value !== p) prefix.value = p;
    if (!p) { lastState = ''; return showStatus(hint, 'muted'); }
    showStatus(i18n.check.checking, 'muted');
    try {
      const res = await fetch(`/api/prefix/check?prefix=${encodeURIComponent(p)}`);
      const data = await res.json();
      lastState = data.state;
      const sugg = data.suggestions?.length ? ` ${i18n.check.suggest} ${data.suggestions.join(' / ')}` : '';
      if (data.state === 'available') showStatus(`${p}.vibe-show.com · ${i18n.check.available}`, 'ok');
      else if (data.state === 'taken') showStatus(i18n.check.taken + sugg, 'bad');
      else if (data.state === 'locked') showStatus(i18n.check.locked + sugg, 'bad');
      else if (data.state === 'reserved') showStatus(i18n.check.reserved, 'bad');
      else if (data.state === 'hint') showStatus(hint, 'muted');
      else showStatus(i18n.check.invalid, 'bad');
    } catch {
      showStatus(hint, 'muted');
    }
  }

  prefix.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(check, 300);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.classList.add('hidden');
    if (!form.reportValidity()) return;
    if (lastState && lastState !== 'available') { prefix.focus(); return; }
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    btn.disabled = true;
    btn.textContent = i18n.sending;
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, lang: i18n.lang })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || i18n.errGeneric);
      form.classList.add('hidden');
      $('submit-ok-text').textContent = i18n.okText.replace('{p}', data.prefix);
      $('submit-ok').classList.remove('hidden');
      $<HTMLInputElement>('status-prefix').value = data.prefix;
    } catch (err) {
      errBox.textContent = err instanceof Error ? err.message : i18n.errGeneric;
      errBox.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = i18n.btn;
    }
  });

  $<HTMLFormElement>('status-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const p = sanitize($<HTMLInputElement>('status-prefix').value);
    const out = $('status-result');
    if (!p) return;
    out.textContent = i18n.check.checking;
    try {
      const res = await fetch(`/api/applications/status?prefix=${encodeURIComponent(p)}`);
      const data = await res.json();
      if (!data.found) { out.textContent = i18n.statusNotFound; return; }
      const label = i18n.statusMap[data.status] || data.status;
      out.innerHTML = '';
      const b = document.createElement('b');
      b.textContent = `${data.prefix}.vibe-show.com · ${label}`;
      out.append(b);
      if (data.status === 'ACTIVE') {
        const a = document.createElement('a');
        a.href = `https://${data.prefix}.vibe-show.com`;
        a.target = '_blank';
        a.rel = 'noopener';
        a.className = 'ml-2 underline';
        a.textContent = '↗';
        out.append(a);
      }
    } catch {
      out.textContent = i18n.errGeneric;
    }
  });
}
