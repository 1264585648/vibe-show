import { Env } from '../types';

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  from?: string;
  replyTo?: string;
}

export interface SendMailResult {
  ok: boolean;
  id?: string;
  skipped?: boolean;
  error?: string;
}

/**
 * Send a plain-text email through Resend and return structured status for admin tools.
 */
export async function sendMailDetailed(env: Env, msg: SendMailOptions): Promise<SendMailResult> {
  if (!env.RESEND_API_KEY) {
    return { ok: false, skipped: true, error: '未配置 RESEND_API_KEY' };
  }
  try {
    const payload: Record<string, unknown> = {
      from: msg.from || env.MAIL_FROM || 'vibe-show <hi@vibe-show.com>',
      to: [msg.to],
      subject: msg.subject,
      text: msg.text
    };
    if (msg.replyTo) {
      payload.reply_to = msg.replyTo;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errText = await res.text();
      console.warn('[mail] resend error', res.status, errText);
      let msgText = `Resend HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(errText) as { message?: string };
        if (parsed?.message) msgText = parsed.message;
      } catch {
        if (errText) msgText = errText.slice(0, 200);
      }
      return { ok: false, error: msgText };
    }
    const data = (await res.json()) as { id?: string };
    return { ok: true, id: data.id };
  } catch (err) {
    const message = (err as Error).message || 'send failed';
    console.warn('[mail] send failed', err);
    return { ok: false, error: message };
  }
}

/**
 * Send a plain-text email through Resend. Optional: returns false and does nothing
 * when RESEND_API_KEY is not configured, so submissions never fail because of email.
 */
export async function sendMail(env: Env, msg: { to: string; subject: string; text: string }): Promise<boolean> {
  const res = await sendMailDetailed(env, msg);
  return res.ok;
}
