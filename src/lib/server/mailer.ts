/**
 * Nodemailer singleton for SMTP sending (ProtonMail or any SMTP provider).
 *
 * Configuration via env vars (all required when SMTP_HOST is set):
 *   SMTP_HOST   — e.g. smtp.protonmail.ch
 *   SMTP_PORT   — default 587
 *   SMTP_SECURE — 'true' for port 465 (SSL), 'false' for STARTTLS
 *   SMTP_USER   — SMTP login (e.g. no-reply@scholio.review)
 *   SMTP_PASS   — SMTP password / token
 *   EMAIL_FROM  — display sender, e.g. "Scholio Librarian <no-reply@scholio.review>"
 *
 * If SMTP_HOST is not set the mailer is disabled and calls are no-ops.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '$env/dynamic/private';

let _transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
	if (!env.SMTP_HOST) return null;
	if (_transporter) return _transporter;

	_transporter = nodemailer.createTransport({
		host: env.SMTP_HOST,
		port: Number(env.SMTP_PORT ?? 587),
		secure: env.SMTP_SECURE === 'true',
		auth: {
			user: env.SMTP_USER,
			pass: env.SMTP_PASS
		}
	});

	return _transporter;
}

export async function sendMail({
	to,
	subject,
	html
}: {
	to: string;
	subject: string;
	html: string;
}): Promise<void> {
	const transporter = getTransporter();

	if (!transporter) {
		console.log(`[mailer] No SMTP_HOST — skipping email to ${to}: ${subject}`);
		return;
	}

	const from = env.EMAIL_FROM ?? 'Scholio Librarian <no-reply@scholio.review>';
	console.log(`[mailer] sending to=${to} subject="${subject}"`);
	await transporter.sendMail({ from, to, subject, html });
	console.log(`[mailer] sent ok to=${to}`);
}
