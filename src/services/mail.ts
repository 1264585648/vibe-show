import { Env } from '../types';

/**
 * Send a plain-text email through Resend. Optional: returns false and does nothing
 * when RESEND_API_KEY is not configured, so submissions never fail because of email.
 */
export async function sendMail(env: Env, msg: { to: string; subject: string; text: string }): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.MAIL_FROM || 'vibe-show <hi@vibe-show.com>',
        to: [msg.to],
        subject: msg.subject,
        text: msg.text
      })
    });
    if (!res.ok) console.warn('[mail] resend error', res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.warn('[mail] send failed', err);
    return false;
  }
}
