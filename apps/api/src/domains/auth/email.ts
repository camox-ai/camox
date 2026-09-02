import type { Bindings } from "../../types";

const AUTH_EMAIL_ADDRESS = "auth@camox.dev";
const AUTH_EMAIL_SENDER = { name: "Camox", email: AUTH_EMAIL_ADDRESS };

type AuthEmail = {
  to: string;
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderHtml(email: AuthEmail): string {
  const actionUrl = escapeHtml(email.actionUrl);
  const preheader = escapeHtml(email.preheader);
  const heading = escapeHtml(email.heading);
  const body = escapeHtml(email.body);
  const actionLabel = escapeHtml(email.actionLabel);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${heading}</title>
  </head>
  <body style="margin:0;background:#f5f5f5;color:#171717;font-family:Arial,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:32px">
            <tr><td style="font-size:20px;font-weight:700;padding-bottom:24px">Camox</td></tr>
            <tr><td style="font-size:24px;font-weight:700;padding-bottom:12px">${heading}</td></tr>
            <tr><td style="font-size:16px;line-height:24px;padding-bottom:24px">${body}</td></tr>
            <tr>
              <td style="padding-bottom:24px">
                <a href="${actionUrl}" style="display:inline-block;background:#171717;color:#fff;text-decoration:none;font-size:16px;font-weight:600;padding:12px 20px;border-radius:8px">${actionLabel}</a>
              </td>
            </tr>
            <tr><td style="font-size:13px;line-height:20px;color:#737373">If the button does not work, copy and paste this link into your browser:<br><a href="${actionUrl}" style="color:#404040;word-break:break-all">${actionUrl}</a></td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendAuthEmail(env: Bindings, email: AuthEmail): Promise<void> {
  await env.EMAIL.send({
    from: AUTH_EMAIL_SENDER,
    to: email.to,
    subject: email.subject,
    text: `${email.heading}\n\n${email.body}\n\n${email.actionLabel}: ${email.actionUrl}`,
    html: renderHtml(email),
  });
}

export function sendVerificationEmail(env: Bindings, to: string, url: string): Promise<void> {
  return sendAuthEmail(env, {
    to,
    subject: "Verify your Camox email",
    preheader: "Confirm your email address to finish creating your Camox account.",
    heading: "Verify your email address",
    body: "Confirm your email address to finish creating your Camox account.",
    actionLabel: "Verify email",
    actionUrl: url,
  });
}

export function sendPasswordResetEmail(env: Bindings, to: string, url: string): Promise<void> {
  return sendAuthEmail(env, {
    to,
    subject: "Reset your Camox password",
    preheader: "Use this secure link to choose a new Camox password.",
    heading: "Reset your password",
    body: "We received a request to reset your Camox password. If you did not request this, you can safely ignore this email.",
    actionLabel: "Reset password",
    actionUrl: url,
  });
}

export function sendOrganizationInvitationEmail(
  env: Bindings,
  invitation: {
    to: string;
    organizationName: string;
    inviterName: string;
    url: string;
  },
): Promise<void> {
  return sendAuthEmail(env, {
    to: invitation.to,
    subject: `You're invited to join ${invitation.organizationName} on Camox`,
    preheader: `${invitation.inviterName} invited you to join ${invitation.organizationName} on Camox.`,
    heading: `Join ${invitation.organizationName}`,
    body: `${invitation.inviterName} invited you to collaborate in ${invitation.organizationName} on Camox.`,
    actionLabel: "View invitation",
    actionUrl: invitation.url,
  });
}
