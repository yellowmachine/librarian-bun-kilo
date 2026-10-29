// La clave de OpenRouter de cada usuario (tabla user_api_keys), cifrada con
// KMS_MASTER_KEY. La conecta él mismo en /account; sin ella, escanear
// estanterías, sugerir etiquetas y buscar portadas con IA no están disponibles.
import { eq } from 'drizzle-orm';
import { withRLS } from './db/rls';
import { userApiKeys } from './db/schema';
import { decryptSecret, encryptSecret } from './kms';

/**
 * Devuelve la clave de OpenRouter (ya descifrada) del usuario, o null si no
 * tiene ninguna conectada.
 */
export async function getOpenRouterApiKey(userId: string): Promise<string | null> {
	const [row] = await withRLS(userId, (tx) =>
		tx.select().from(userApiKeys).where(eq(userApiKeys.userId, userId))
	);
	if (!row) return null;

	try {
		return await decryptSecret(row);
	} catch (err) {
		// Clave corrupta o KMS_MASTER_KEY cambiada — no bloquear al usuario,
		// simplemente tratar como "sin clave".
		console.error('getOpenRouterApiKey: decryptSecret failed (KMS_MASTER_KEY changed?)', err);
		return null;
	}
}

/** Si el usuario tiene clave conectada, sin descifrarla. */
export async function hasOpenRouterApiKey(userId: string): Promise<boolean> {
	const rows = await withRLS(userId, (tx) =>
		tx
			.select({ userId: userApiKeys.userId })
			.from(userApiKeys)
			.where(eq(userApiKeys.userId, userId))
	);
	return rows.length > 0;
}

/** Guarda (o sustituye) la clave del usuario, cifrada. */
export async function setOpenRouterApiKey(userId: string, apiKey: string): Promise<void> {
	const secret = await encryptSecret(apiKey);
	await withRLS(userId, (tx) =>
		tx
			.insert(userApiKeys)
			.values({ userId, ...secret })
			.onConflictDoUpdate({
				target: userApiKeys.userId,
				set: { ...secret, updatedAt: new Date() }
			})
	);
}

export async function removeOpenRouterApiKey(userId: string): Promise<void> {
	await withRLS(userId, (tx) => tx.delete(userApiKeys).where(eq(userApiKeys.userId, userId)));
}
