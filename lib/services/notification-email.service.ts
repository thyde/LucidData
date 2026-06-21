// Optional email delivery for notifications.
//
// In-app notifications are the primary channel. Email is best-effort and, by
// default, a no-op: with no transport configured nothing is sent, so the app
// works without secrets. The transport is chosen with EMAIL_TRANSPORT:
//
//   console  -> log the rendered email to the server console (local visibility)
//   smtp     -> send over SMTP, e.g. Mailpit/Inbucket in local Supabase
//   resend   -> deliver through Resend's HTTP API (recommended on serverless)
//
// When EMAIL_TRANSPORT is unset we fall back to 'resend' if RESEND_API_KEY is
// present, otherwise 'none' (no-op) -- preserving the prior behaviour.
//
// Only metadata (titles, org names) ever appears in email. Never put vault
// plaintext, keys, or recovery codes here.

export interface NotificationEmail {
  title: string
  message: string
  // App-relative path to the relevant resource, e.g. '/requests'. Combined with
  // NEXT_PUBLIC_APP_URL to build an absolute deep link in the email CTA.
  deepLinkPath?: string
}

export type EmailTransport = 'none' | 'console' | 'smtp' | 'resend'

const DEFAULT_FROM = 'LucidData <noreply@luciddata.app>'

export function resolveTransport(): EmailTransport {
  const configured = process.env.EMAIL_TRANSPORT?.toLowerCase().trim()
  if (configured === 'console' || configured === 'smtp' || configured === 'resend') {
    return configured
  }
  // No explicit transport: keep working without secrets, but use Resend if a key
  // happens to be set so existing deployments keep delivering.
  if (process.env.RESEND_API_KEY) return 'resend'
  return 'none'
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface RenderedEmail {
  subject: string
  text: string
  html: string
}

// Build the subject, plain-text, and HTML bodies for a notification. The HTML
// template has a single call-to-action linking to the relevant resource plus a
// "manage notifications" link to the settings page.
export function renderNotificationEmail(email: NotificationEmail): RenderedEmail {
  const base = appUrl()
  const actionUrl = email.deepLinkPath ? `${base}${email.deepLinkPath}` : `${base}/dashboard`
  const manageUrl = `${base}/settings`

  const subject = email.title
  const text = [
    email.message,
    '',
    `View it here: ${actionUrl}`,
    '',
    `Manage email notifications: ${manageUrl}`,
  ].join('\n')

  const safeTitle = escapeHtml(email.title)
  const safeMessage = escapeHtml(email.message)
  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;border:1px solid #e4e4e7;">
            <tr>
              <td style="padding:32px 32px 8px;">
                <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#71717a;">LucidData</p>
                <h1 style="margin:12px 0 0;font-size:20px;line-height:1.3;color:#18181b;">${safeTitle}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 24px;">
                <p style="margin:0;font-size:15px;line-height:1.6;color:#3f3f46;">${safeMessage}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;">
                <a href="${actionUrl}" style="display:inline-block;background-color:#18181b;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 20px;border-radius:8px;">View it in LucidData</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;border-top:1px solid #f4f4f5;">
                <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#a1a1aa;">
                  You received this because email notifications are on.
                  <a href="${manageUrl}" style="color:#71717a;">Manage notifications</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, text, html }
}

async function sendViaSmtp(to: string, from: string, rendered: RenderedEmail): Promise<void> {
  // Imported lazily so the dependency only loads when SMTP is actually used,
  // keeping the no-op/console/resend paths free of it.
  const nodemailer = await import('nodemailer')
  const host = process.env.EMAIL_SMTP_HOST ?? '127.0.0.1'
  const port = Number(process.env.EMAIL_SMTP_PORT ?? 54325)
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: false,
    auth: process.env.EMAIL_SMTP_USER
      ? { user: process.env.EMAIL_SMTP_USER, pass: process.env.EMAIL_SMTP_PASS ?? '' }
      : undefined,
  })
  await transport.sendMail({
    from,
    to,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
  })
}

async function sendViaResend(to: string, from: string, rendered: RenderedEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return // Selected resend without a key: nothing to do.
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    }),
  })
  if (!res.ok) {
    throw new Error(`Email delivery failed (${res.status})`)
  }
}

export async function sendNotificationEmail(to: string, email: NotificationEmail): Promise<void> {
  const transport = resolveTransport()
  if (transport === 'none') return // No transport configured: in-app notification only.

  const from = process.env.NOTIFICATION_EMAIL_FROM ?? DEFAULT_FROM
  const rendered = renderNotificationEmail(email)

  switch (transport) {
    case 'console':
      // Local visibility without a mail server. Metadata only, never secrets.
      console.info(
        `[email:console] to=${to} from=${from}\nsubject: ${rendered.subject}\n${rendered.text}`
      )
      return
    case 'smtp':
      await sendViaSmtp(to, from, rendered)
      return
    case 'resend':
      await sendViaResend(to, from, rendered)
      return
  }
}
