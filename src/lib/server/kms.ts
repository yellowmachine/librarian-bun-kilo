// Cifrado de los secretos de los usuarios (sus claves de OpenRouter) con
// AES-256-GCM. La clave sale de KMS_MASTER_KEY; si cambia, las ya guardadas
// dejan de poder descifrarse y cada uno tendrá que conectar la suya otra vez.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';

export interface EncryptedSecret {
	encryptedApiKey: string;
	iv: string;
	authTag: string;
}

function getMasterKey(): Buffer {
	if (!env.KMS_MASTER_KEY) throw new Error('KMS_MASTER_KEY not configured');
	return createHash('sha256').update(env.KMS_MASTER_KEY).digest();
}

export async function encryptSecret(plain: string): Promise<EncryptedSecret> {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', getMasterKey(), iv);
	const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	return {
		encryptedApiKey: encrypted.toString('hex'),
		iv: iv.toString('hex'),
		authTag: cipher.getAuthTag().toString('hex')
	};
}

export async function decryptSecret(params: EncryptedSecret): Promise<string> {
	const key = getMasterKey();
	const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(params.iv, 'hex'));
	decipher.setAuthTag(Buffer.from(params.authTag, 'hex'));

	const decrypted = Buffer.concat([
		decipher.update(Buffer.from(params.encryptedApiKey, 'hex')),
		decipher.final()
	]);

	return decrypted.toString('utf8');
}
