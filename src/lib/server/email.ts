import { Resend } from 'resend';
import { env } from '$env/dynamic/private';

const resend = new Resend(env.RESEND_API_KEY);

const FROM = 'The Svelte Librarian <noreply@thesveltelibrarian.org>';

export async function sendVerificationEmail(to: string, url: string): Promise<void> {
	await resend.emails.send({
		from: FROM,
		to,
		subject: 'Confirma tu cuenta en The Svelte Librarian',
		html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Georgia,serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:40px">
        <tr><td>
          <p style="margin:0 0 8px;font-size:22px;font-weight:400;color:#0a0a0a;letter-spacing:-0.5px">
            The Svelte Librarian
          </p>
          <p style="margin:0 0 32px;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#a3a3a3">
            Beta
          </p>
          <p style="margin:0 0 16px;font-size:16px;color:#404040;line-height:1.6">
            Gracias por registrarte. Confirma tu dirección de email para activar tu cuenta.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:32px 0">
            <tr><td style="background:#0a0a0a;border-radius:6px">
              <a href="${url}" style="display:inline-block;padding:12px 28px;font-family:sans-serif;font-size:14px;font-weight:600;color:#fff;text-decoration:none">
                Confirmar email
              </a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;font-size:13px;color:#a3a3a3;line-height:1.5">
            Si no creaste esta cuenta, puedes ignorar este mensaje.
          </p>
          <p style="margin:0;font-size:13px;color:#a3a3a3;line-height:1.5">
            El enlace expira en 24 horas.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
		text: `Confirma tu cuenta en The Svelte Librarian\n\nVisita este enlace para activar tu cuenta:\n${url}\n\nEl enlace expira en 24 horas. Si no creaste esta cuenta, ignora este mensaje.`
	});
}
