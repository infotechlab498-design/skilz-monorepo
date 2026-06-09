import nodemailer from 'nodemailer';

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(text, max = 800) {
  const t = String(text || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function isContactReplySmtpConfigured() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const from = String(process.env.CONTACT_REPLY_FROM_EMAIL || '').trim();
  return Boolean(host && from);
}

/**
 * Sends the admin reply to the visitor's contact email (SMTP).
 * @returns {{ ok: true } | { ok: false, errorMessage: string }}
 */
export async function sendContactReplyEmail({
  toEmail,
  visitorFirstName,
  replyBodyPlain,
  originalMessagePlain,
}) {
  if (!isContactReplySmtpConfigured()) {
    return { ok: false, errorMessage: 'smtp_not_configured' };
  }

  const host = String(process.env.SMTP_HOST || '').trim();
  const port = parseInt(String(process.env.SMTP_PORT || '587'), 10);
  const secureEnv = String(process.env.SMTP_SECURE || '').toLowerCase();
  const secure = secureEnv === 'true' || secureEnv === '1' || port === 465;

  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '');

  const fromEmail = String(process.env.CONTACT_REPLY_FROM_EMAIL || '').trim();
  const fromName = String(process.env.CONTACT_REPLY_FROM_NAME || 'Support').trim();
  const subjectPrefix = String(process.env.CONTACT_REPLY_SUBJECT_PREFIX || 'Re: Your inquiry').trim();

  const first = String(visitorFirstName || 'there').trim() || 'there';
  const reply = String(replyBodyPlain || '').trim();
  const original = truncate(originalMessagePlain, 1200);

  const text = [
    `Hi ${first},`,
    '',
    'Thank you for contacting us. Here is our reply:',
    '',
    reply,
    '',
    '---',
    'Your original message:',
    original || '(empty)',
    '',
    '— Support',
  ].join('\n');

  const html = `
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#101828;">
<p>Hi ${escapeHtml(first)},</p>
<p>Thank you for contacting us. Here is our reply:</p>
<p style="white-space:pre-wrap;">${escapeHtml(reply)}</p>
<hr style="border:none;border-top:1px solid #e4e7ec;margin:24px 0;" />
<p style="font-size:12px;color:#667085;text-transform:uppercase;letter-spacing:0.06em;">Your original message</p>
<p style="white-space:pre-wrap;color:#475467;">${escapeHtml(original)}</p>
<p style="margin-top:24px;color:#667085;font-size:13px;">— Support</p>
</body></html>`.trim();

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass } : undefined,
    });

    await transporter.sendMail({
      from: fromName ? `"${fromName.replace(/"/g, '')}" <${fromEmail}>` : fromEmail,
      to: toEmail,
      subject: subjectPrefix,
      text,
      html,
    });

    return { ok: true };
  } catch (err) {
    const msg = err?.message || String(err);
    console.error('[contactReplyEmail] send failed', { toEmail, message: msg });
    return { ok: false, errorMessage: msg.slice(0, 500) };
  }
}
