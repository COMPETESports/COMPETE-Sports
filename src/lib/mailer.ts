/**
 * Outbound email.
 *
 * Resend if RESEND_API_KEY is set; otherwise the message is written to the
 * server log. That is not a stub for its own sake — it means password reset
 * works end to end in development and on a preview deploy before any email
 * provider exists, and the day the key is added nothing else changes.
 *
 * Deliberately no HTML. A password-reset email that is one sentence and a
 * link is less likely to land in spam than a designed one, and there is
 * nothing here worth designing yet.
 */

const FROM = process.env.MAIL_FROM ?? 'COMPETE <hello@joincompete.com>';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export async function sendMail(mail: Mail): Promise<{ ok: boolean; detail?: string }> {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    console.info(
      [
        '',
        '─── email not sent: RESEND_API_KEY is not set ───',
        `to:      ${mail.to}`,
        `subject: ${mail.subject}`,
        '',
        mail.text,
        '────────────────────────────────────────────────',
        '',
      ].join('\n'),
    );
    return { ok: false, detail: 'no-provider' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
      cache: 'no-store',
    });
    if (!response.ok) {
      console.error('Resend rejected the message:', response.status, await response.text());
      return { ok: false, detail: `http-${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    console.error('Could not reach Resend:', error);
    return { ok: false, detail: 'network' };
  }
}
