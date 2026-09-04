/* ============================================================
   MAIL — transactional email through Resend.

   Optional on purpose. With no RESEND_API_KEY the site still works: sign-up
   simply doesn't ask for verification and password reset reports itself as
   unavailable, rather than silently swallowing a request the user is
   waiting on. Add the key and both light up with no code change.

     RESEND_API_KEY   re_...                                   (SECRET)
     MAIL_FROM        Kenpachi Trades <no-reply@yourdomain>    (optional)
   ============================================================ */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export const mailEnabled = () => Boolean(process.env.RESEND_API_KEY);

const from = () => process.env.MAIL_FROM || 'Kenpachi Trades <no-reply@kenpachitrades.com>';

async function send({ to, subject, html, text }) {
  if (!mailEnabled()) return false;
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from: from(), to: [to], subject, html, text }),
    });
    if (!res.ok) {
      console.error('Resend rejected the message', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('Resend request threw', err);
    return false;
  }
}

/* The template is inlined rather than assembled from the site's CSS: mail
   clients strip stylesheets, and a table-free single column is the one
   layout all of them render the same way. */
function shell(heading, body, button) {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f7fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:36px 20px;">
    <div style="font-size:17px;font-weight:700;color:#2e3440;margin-bottom:26px;">Kenpachi Trades</div>
    <div style="background:#ffffff;border:1px solid #e6e9f3;border-radius:18px;padding:32px;">
      <h1 style="margin:0 0 14px;font-size:21px;line-height:1.25;color:#2e3440;">${heading}</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#5c6472;">${body}</p>
      <a href="${button.href}" style="display:inline-block;background:#6274f2;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 26px;border-radius:11px;">${button.label}</a>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#8a91a3;">Or paste this link into your browser:<br><span style="color:#6274f2;word-break:break-all;">${button.href}</span></p>
    </div>
    <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#8a91a3;">If you didn't ask for this email you can ignore it — nothing changes until the link above is used.</p>
  </div>
</body></html>`;
}

/* The code gets its own template: big, monospaced, and the only thing worth
   looking at. Anything else in the message competes with the six digits the
   reader is here to copy. */
export function sendEmailCode(to, code) {
  return send({
    to,
    subject: `${code} is your Kenpachi Trades confirmation code`,
    html: `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f7fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:36px 20px;">
    <div style="font-size:17px;font-weight:700;color:#2e3440;margin-bottom:26px;">Kenpachi Trades</div>
    <div style="background:#ffffff;border:1px solid #e6e9f3;border-radius:18px;padding:32px;text-align:center;">
      <h1 style="margin:0 0 10px;font-size:20px;color:#2e3440;">Confirm your email</h1>
      <p style="margin:0 0 26px;font-size:15px;line-height:1.6;color:#5c6472;">Enter this code on your profile page.</p>
      <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:0.22em;color:#2e3440;background:#f5f7fc;border:1px solid #e6e9f3;border-radius:14px;padding:18px 10px;">${code}</div>
      <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#8a91a3;">The code works for 15 minutes. If you didn't ask for it, ignore this email — nothing changes.</p>
    </div>
  </div>
</body></html>`,
    text: `Your Kenpachi Trades confirmation code is ${code}

Enter it on your profile page. It works for 15 minutes.`,
  });
}

export function sendPasswordReset(to, link) {
  return send({
    to,
    subject: 'Reset your password · Kenpachi Trades',
    html: shell(
      'Reset your password',
      'Click below to choose a new password. The link works for one hour, and stops working as soon as your password changes.',
      { href: link, label: 'Choose a new password' },
    ),
    text: `Reset your Kenpachi Trades password:\n\n${link}\n\nThe link works for one hour.`,
  });
}
