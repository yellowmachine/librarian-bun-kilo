import { fail, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db/index';
import { user } from '$lib/server/db/schema';
import { auth } from '$lib/server/auth';

// Si ya hay usuarios, esta ruta no debe ser accesible
async function guardAlreadySetup() {
	const rows = await db.select({ id: user.id }).from(user).limit(1);
	if (rows.length > 0) redirect(302, '/');
}

export const load = async () => {
	await guardAlreadySetup();
};

export const actions = {
	default: async ({ request }: RequestEvent) => {
		await guardAlreadySetup();

		const data = await request.formData();
		const name = (data.get('name') as string)?.trim();
		const email = (data.get('email') as string)?.trim();
		const password = data.get('password') as string;

		if (!name || !email || !password) {
			return fail(400, { error: 'Todos los campos son obligatorios' });
		}
		if (password.length < 8) {
			return fail(400, { error: 'La contraseña debe tener al menos 8 caracteres' });
		}

		const result = await auth.api.signUpEmail({
			body: { name, email, password },
			headers: request.headers
		});

		if (!result?.user) {
			return fail(400, { error: 'No se pudo crear la cuenta' });
		}

		redirect(302, '/library');
	}
};
