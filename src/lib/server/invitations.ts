import { env } from '$env/dynamic/private';
import { db } from './db';
import { sendInvitationEmail } from './email';
import { invitationStore } from './invitation-store';

/** Las invitaciones de la app (invitation-store.ts), sobre su base de datos. */
export const invitations = invitationStore(db);

export const invitationLink = (token: string) => `${env.ORIGIN}/invitacion/${token}`;

/**
 * Invitada, y su enlace mandado por correo. Si el correo no sale, la invitación
 * se queda igual: `sent` false, y su enlace está ahí para pasarlo a mano.
 */
export async function inviteAndSend(email: string, inviter: { id: string; name: string }) {
	const made = await invitations.invite(email, inviter.id);
	if (!made.ok) return made;
	const link = invitationLink(made.token);
	let sent = true;
	try {
		await sendInvitationEmail({ to: email.trim(), url: link, inviterName: inviter.name });
	} catch (err) {
		console.error(`[invitations] El correo a ${email} no salió:`, err);
		sent = false;
	}
	return { ok: true as const, link, sent };
}

/**
 * Al arrancar sin ninguna cuenta: una invitación para ADMIN_EMAIL, por correo y en
 * el log, para que alguien pueda entrar la primera vez.
 */
export async function inviteFirstAccount() {
	if (!env.ADMIN_EMAIL || !(await invitations.noAccountsYet())) return;
	const made = await invitations.invite(env.ADMIN_EMAIL, null);
	if (!made.ok) return;
	const link = invitationLink(made.token);
	console.log(`[invitations] Sin cuentas todavía. Invitación para ${env.ADMIN_EMAIL}: ${link}`);
	await sendInvitationEmail({ to: env.ADMIN_EMAIL, url: link, inviterName: null }).catch((err) =>
		console.error(`[invitations] El correo a ${env.ADMIN_EMAIL} no salió:`, err)
	);
}
