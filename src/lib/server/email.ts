import { env } from '$env/dynamic/private';
import { sendMail } from './mailer';

const APP_URL = env.ORIGIN ?? 'http://localhost:5173';

// ─── Auth ─────────────────────────────────────────────────────────────────────

/** El marco de los correos de cuenta: cabecera, un texto, un botón y una nota al pie. */
function accountEmail(p: { text: string; button: string; url: string; note: string }): string {
	return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Georgia,serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fff;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden">
        <tr><td style="background:#0a0a0a;padding:28px 40px">
          <p style="margin:0;font-family:Georgia,serif;font-size:20px;color:#fff">Librarian</p>
        </td></tr>
        <tr><td style="padding:36px 40px 28px">
          <p style="margin:0 0 16px;font-size:16px;color:#404040;line-height:1.6">
            ${p.text}
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:28px 0">
            <tr><td style="background:#0a0a0a;border-radius:6px">
              <a href="${p.url}" style="display:inline-block;padding:12px 28px;font-family:sans-serif;font-size:14px;font-weight:600;color:#fff;text-decoration:none">
                ${p.button}
              </a>
            </td></tr>
          </table>
          <p style="margin:0 0 12px;font-size:13px;color:#a3a3a3;line-height:1.5">
            Si el botón no funciona, copia este enlace: <a href="${p.url}" style="color:#737373">${p.url}</a>
          </p>
          <p style="margin:0;font-size:13px;color:#a3a3a3;line-height:1.5">
            ${p.note}
          </p>
        </td></tr>
        <tr><td style="padding:20px 40px;border-top:1px solid #e5e5e5">
          <p style="margin:0;font-size:12px;color:#a3a3a3">
            Librarian · <a href="${APP_URL}" style="color:#a3a3a3">${APP_URL}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function sendVerificationEmail(to: string, url: string): Promise<void> {
	await sendMail({
		to,
		subject: 'Confirma tu email en Librarian',
		html: accountEmail({
			text: 'Confirma tu dirección de email para seguir usando tu cuenta.',
			button: 'Confirmar email',
			url,
			note: 'Si no fuiste tú, puedes ignorar este mensaje. El enlace caduca en 24 horas.'
		})
	});
}

export async function sendResetPasswordEmail(to: string, url: string): Promise<void> {
	await sendMail({
		to,
		subject: 'Cambia tu contraseña de Librarian',
		html: accountEmail({
			text: 'Alguien (seguramente tú) ha pedido cambiar la contraseña de tu cuenta.',
			button: 'Elegir una contraseña nueva',
			url,
			note: 'Si no lo pediste, ignora este mensaje: tu contraseña sigue igual. El enlace caduca en 1 hora.'
		})
	});
}

/** Sin quien invita: la primera invitación, la de ADMIN_EMAIL. */
export async function sendInvitationEmail(p: {
	to: string;
	url: string;
	inviterName: string | null;
}): Promise<void> {
	const who = p.inviterName
		? `<strong>${escapeHtml(p.inviterName)}</strong> te invita`
		: 'Te invitan';
	await sendMail({
		to: p.to,
		subject: p.inviterName ? `${p.inviterName} te invita a Librarian` : 'Tu invitación a Librarian',
		html: accountEmail({
			text: `${who} a Librarian, para organizar tus libros y prestarlos a la gente en la que confías.`,
			button: 'Crear mi cuenta',
			url: p.url,
			note: 'Si no conoces a quien te invita, ignora este mensaje. La invitación caduca en 7 días.'
		})
	});
}

// ─── Préstamos ────────────────────────────────────────────────────────────────

export async function sendLoanRequestEmail({
	to,
	ownerName,
	borrowerName,
	bookTitle,
	loanId,
	notes
}: {
	to: string;
	ownerName: string;
	borrowerName: string;
	bookTitle: string;
	loanId: string;
	notes?: string | null;
}): Promise<void> {
	const loanUrl = `${APP_URL}/loans/${loanId}`;
	const notesBlock = notes
		? `<table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px">
            <tr><td style="background:#f5f5f5;border-radius:6px;border-left:3px solid #a3a3a3;padding:12px 16px">
              <p style="margin:0;font-size:13px;color:#737373">Mensaje</p>
              <p style="margin:4px 0 0;font-size:15px;color:#0a0a0a;font-style:italic">"${notes}"</p>
            </td></tr>
          </table>`
		: '';

	await sendMail({
		to,
		subject: `${borrowerName} quiere pedirte prestado "${bookTitle}"`,
		html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Georgia,serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fff;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden">
        <tr><td style="background:#0a0a0a;padding:28px 40px">
          <p style="margin:0;font-family:Georgia,serif;font-size:20px;color:#fff">Librarian</p>
        </td></tr>
        <tr><td style="padding:36px 40px 28px">
          <p style="margin:0 0 20px;font-size:16px;color:#404040;line-height:1.6">
            Hola ${ownerName},
          </p>
          <p style="margin:0 0 20px;font-size:16px;color:#404040;line-height:1.6">
            <strong>${borrowerName}</strong> te está pidiendo prestado <strong>"${bookTitle}"</strong>.
          </p>
          ${notesBlock}
          <table cellpadding="0" cellspacing="0" style="margin:28px 0">
            <tr><td style="background:#0a0a0a;border-radius:6px">
              <a href="${loanUrl}" style="display:inline-block;padding:12px 28px;font-family:sans-serif;font-size:14px;font-weight:600;color:#fff;text-decoration:none">
                Ver solicitud →
              </a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:#a3a3a3;line-height:1.5">
            Puedes aceptar o rechazar la solicitud desde la app.
          </p>
        </td></tr>
        <tr><td style="padding:20px 40px;border-top:1px solid #e5e5e5">
          <p style="margin:0;font-size:12px;color:#a3a3a3">
            Librarian · <a href="${APP_URL}" style="color:#a3a3a3">${APP_URL}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
	});
}

export async function sendLoanAcceptedEmail({
	to,
	borrowerName,
	ownerName,
	bookTitle,
	loanId,
	notes
}: {
	to: string;
	borrowerName: string;
	ownerName: string;
	bookTitle: string;
	loanId: string;
	notes?: string | null;
}): Promise<void> {
	const loanUrl = `${APP_URL}/loans/${loanId}`;
	const notesBlock = notes
		? `<table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px">
            <tr><td style="background:#f5f5f5;border-radius:6px;border-left:3px solid #a3a3a3;padding:12px 16px">
              <p style="margin:0;font-size:13px;color:#737373">Mensaje</p>
              <p style="margin:4px 0 0;font-size:15px;color:#0a0a0a;font-style:italic">"${notes}"</p>
            </td></tr>
          </table>`
		: '';

	await sendMail({
		to,
		subject: `${ownerName} ha aceptado prestarte "${bookTitle}"`,
		html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Georgia,serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fff;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden">
        <tr><td style="background:#0a0a0a;padding:28px 40px">
          <p style="margin:0;font-family:Georgia,serif;font-size:20px;color:#fff">Librarian</p>
        </td></tr>
        <tr><td style="padding:36px 40px 28px">
          <p style="margin:0 0 20px;font-size:16px;color:#404040;line-height:1.6">
            Hola ${borrowerName},
          </p>
          <p style="margin:0 0 20px;font-size:16px;color:#404040;line-height:1.6">
            <strong>${ownerName}</strong> ha aceptado prestarte <strong>"${bookTitle}"</strong>.
            Coordinad entre vosotros cómo y cuándo queréis hacer el intercambio.
          </p>
          ${notesBlock}
          <table cellpadding="0" cellspacing="0" style="margin:28px 0">
            <tr><td style="background:#0a0a0a;border-radius:6px">
              <a href="${loanUrl}" style="display:inline-block;padding:12px 28px;font-family:sans-serif;font-size:14px;font-weight:600;color:#fff;text-decoration:none">
                Ver préstamo →
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 40px;border-top:1px solid #e5e5e5">
          <p style="margin:0;font-size:12px;color:#a3a3a3">
            Librarian · <a href="${APP_URL}" style="color:#a3a3a3">${APP_URL}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
	});
}
