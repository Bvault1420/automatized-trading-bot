import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { db } from '../store/db.js';
import { createLogger } from '../util/logger.js';

const log = createLogger('mail');

function configured(): boolean {
  const to = db.data.settings.alertEmail || config.smtp.to;
  return Boolean(config.smtp.host && to);
}

export function emailStatus(): { configured: boolean } {
  return { configured: configured() };
}

export async function sendAlert(subject: string, text: string): Promise<void> {
  const to = db.data.settings.alertEmail || config.smtp.to;
  if (!config.smtp.host || !to) {
    log.info(`E-Mail übersprungen (nicht konfiguriert): ${subject}`);
    return;
  }
  try {
    const transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
    await transport.sendMail({
      from: config.smtp.from,
      to,
      subject: `[Aegis] ${subject}`,
      text,
    });
    log.success(`E-Mail gesendet: ${subject}`);
  } catch (err) {
    log.warn(`E-Mail fehlgeschlagen: ${(err as Error).message}`);
  }
}
