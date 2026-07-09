// Lee (nunca escribe) la clave de OpenRouter que el usuario ya conectó en
// Scholio — Scholio y Librarian comparten Postgres y el mismo rol de app
// (scholio_app, ver withRLS()), así que esto es una simple lectura
// cross-schema con RLS, no una integración nueva de credenciales.
//
// scholio.user_api_key no es una tabla de Librarian (no se migra ni se posee
// aquí), así que se consulta con SQL crudo en vez de una tabla Drizzle propia.
import { sql } from 'drizzle-orm';
import { withRLS } from './db/rls';
import { decryptSecret } from './kms';

interface UserApiKeyRow extends Record<string, unknown> {
	encrypted_api_key: string;
	iv: string;
	auth_tag: string;
}

/**
 * Devuelve la clave de OpenRouter (ya descifrada) del usuario, o null si no
 * tiene ninguna clave habilitada conectada en Scholio.
 */
export async function getOpenRouterApiKey(userId: string): Promise<string | null> {
	return withRLS(userId, async (tx) => {
		const rows = await tx.execute<UserApiKeyRow>(sql`
			select encrypted_api_key, iv, auth_tag
			from scholio.user_api_key
			where user_id = ${userId} and enabled = true
			order by created_at desc
			limit 1
		`);

		const row = rows[0];
		if (!row) return null;

		try {
			return await decryptSecret({
				encryptedApiKey: row.encrypted_api_key,
				iv: row.iv,
				authTag: row.auth_tag
			});
		} catch {
			// Clave corrupta o KMS_MASTER_KEY desincronizada con Scholio — no
			// bloquear al usuario, simplemente tratar como "sin clave".
			return null;
		}
	});
}
