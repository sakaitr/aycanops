/**
 * lib/mailer.ts — E-posta gönderimi (nodemailer + SMTP)
 *
 * Env vars:
 *   SMTP_HOST      — SMTP sunucu adresi (zorunlu)
 *   SMTP_PORT      — port (varsayılan: 587)
 *   SMTP_SECURE    — "true" for TLS/SSL (varsayılan: false)
 *   SMTP_USER      — SMTP kullanıcı adı
 *   SMTP_PASS      — SMTP şifresi
 *   SMTP_FROM      — Gönderici adresi (varsayılan: no-reply@aycanops.local)
 *
 * Falls back to no-op (console.log) if SMTP_HOST is not configured.
 */

import type { Transporter } from "nodemailer";

let _transporter: Transporter | null = null;
let _initialized = false;

function getTransporter(): Transporter | null {
  if (_initialized) return _transporter;
  _initialized = true;

  const host = process.env.SMTP_HOST;
  if (!host) {
    console.warn("[mailer] SMTP_HOST yapılandırılmadı — e-posta devre dışı");
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodemailer = require("nodemailer");
    _transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    return _transporter;
  } catch (err) {
    console.error("[mailer] nodemailer init hatası:", err);
    return null;
  }
}

export type MailOptions = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

const FROM = process.env.SMTP_FROM || "Aycan OPS <no-reply@aycanops.local>";

/**
 * E-posta gönder.
 * SMTP yapılandırılmamışsa sessizce devam eder (log yazar).
 */
export async function sendMail(opts: MailOptions): Promise<boolean> {
  const transporter = getTransporter();

  if (!transporter) {
    console.log("[mailer] (no-op) E-posta:", opts.subject, "→", opts.to);
    return false;
  }

  try {
    await transporter.sendMail({
      from: FROM,
      to: Array.isArray(opts.to) ? opts.to.join(", ") : opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text || opts.html.replace(/<[^>]+>/g, ""),
    });
    return true;
  } catch (err) {
    console.error("[mailer] Gönderim hatası:", err);
    return false;
  }
}

/** Bildirim e-postası şablonu */
export function notificationTemplate(opts: {
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
}): string {
  const action = opts.actionUrl
    ? `<p style="margin:24px 0 0"><a href="${opts.actionUrl}" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">${opts.actionLabel ?? "Görüntüle"}</a></p>`
    : "";

  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#09090b;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:520px;margin:40px auto;background:#18181b;border-radius:16px;overflow:hidden;border:1px solid #27272a">
    <div style="background:#6366f1;padding:24px 32px">
      <h1 style="margin:0;color:#fff;font-size:18px;font-weight:700">Aycan OPS</h1>
    </div>
    <div style="padding:32px">
      <h2 style="margin:0 0 12px;color:#f4f4f5;font-size:18px">${opts.title}</h2>
      <p style="margin:0;color:#a1a1aa;font-size:14px;line-height:1.6">${opts.message}</p>
      ${action}
    </div>
    <div style="padding:16px 32px;border-top:1px solid #27272a">
      <p style="margin:0;color:#52525b;font-size:12px">Bu e-posta Aycan OPS tarafından gönderilmiştir.</p>
    </div>
  </div>
</body>
</html>`;
}
