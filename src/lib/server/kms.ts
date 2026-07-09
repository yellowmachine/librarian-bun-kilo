// Descifrado de secretos compartido con Scholio (misma KMS_MASTER_KEY en ambos
// despliegues). Mismo esquema AES-256-GCM que src/lib/server/kms.ts en el repo
// de Scholio — se copia en vez de importarse porque son despliegues separados.
// Librarian solo necesita descifrar (nunca cifra nada aquí).
import { createDecipheriv, createHash } from 'crypto';
import { env } from '$env/dynamic/private';

function getMasterKey(): Buffer {
	if (!env.KMS_MASTER_KEY) throw new Error('KMS_MASTER_KEY not configured');
	return createHash('sha256').update(env.KMS_MASTER_KEY).digest();
}

export async function decryptSecret(params: {
	encryptedApiKey: string;
	iv: string;
	authTag: string;
}): Promise<string> {
	const key = getMasterKey();
	const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(params.iv, 'hex'));
	decipher.setAuthTag(Buffer.from(params.authTag, 'hex'));

	const decrypted = Buffer.concat([
		decipher.update(Buffer.from(params.encryptedApiKey, 'hex')),
		decipher.final()
	]);

	return decrypted.toString('utf8');
}
