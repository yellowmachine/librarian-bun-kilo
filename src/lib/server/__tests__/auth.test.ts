import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../db/test-db';
import { account, user } from '../db/schema';
import { createAuthOptions, type SeilideConfig } from '../auth-options';
import { invitationStore } from '../invitation-store';

// Login con contraseña y «Entrar con Seilide» sobre la base de verdad (PGlite con
// las migraciones), con Seilide simulado: discovery, token y userinfo.

const SEILIDE: SeilideConfig = {
	url: 'https://seilide.test',
	clientId: 'librarian',
	clientSecret: 'secret'
};
const LIBRARIAN = 'https://librarian.test';
const PASSWORD = 'una-contraseña-larga';

type Profile = { sub: string; email: string; email_verified: boolean; name: string };

function fakeSeilide(profile: Profile) {
	return vi.fn(async (input: string | URL | Request) => {
		const url = String(input instanceof Request ? input.url : input);
		if (url.endsWith('/.well-known/openid-configuration')) {
			return Response.json({
				issuer: SEILIDE.url,
				authorization_endpoint: `${SEILIDE.url}/api/auth/oauth2/authorize`,
				token_endpoint: `${SEILIDE.url}/api/auth/oauth2/token`,
				userinfo_endpoint: `${SEILIDE.url}/api/auth/oauth2/userinfo`
			});
		}
		if (url.endsWith('/oauth2/token')) {
			return Response.json({
				access_token: 'access',
				token_type: 'Bearer',
				expires_in: 3600,
				scope: 'openid profile email'
			});
		}
		if (url.endsWith('/oauth2/userinfo')) return Response.json(profile);
		return new Response('not found', { status: 404 });
	});
}

let tdb: TestDb;
const sentVerification = vi.fn(async () => {});

function createAuth(seilide: SeilideConfig | null = SEILIDE) {
	return betterAuth(
		createAuthOptions({
			db: tdb.db,
			secret: 'test-secret-test-secret-test-secret',
			baseURL: LIBRARIAN,
			seilide,
			sendVerificationEmail: sentVerification,
			sendResetPassword: async () => {}
		})
	);
}
type Auth = ReturnType<typeof createAuth>;

/** «Entrar con Seilide» de punta a punta, como lo haría el navegador. */
async function signInWithSeilide(auth: Auth, profile: Profile) {
	vi.stubGlobal('fetch', fakeSeilide(profile));
	const { headers, response } = await auth.api.signInWithOAuth2({
		body: { providerId: 'seilide', callbackURL: '/library' },
		returnHeaders: true
	});
	const authorize = new URL(response.url);
	expect(authorize.origin + authorize.pathname).toBe(`${SEILIDE.url}/api/auth/oauth2/authorize`);
	expect(authorize.searchParams.get('redirect_uri')).toBe(
		`${LIBRARIAN}/api/auth/oauth2/callback/seilide`
	);
	expect(authorize.searchParams.get('scope')).toBe('openid profile email');
	expect(authorize.searchParams.get('code_challenge')).toBeTruthy();

	const cookie = headers
		.getSetCookie()
		.map((c) => c.split(';', 1)[0])
		.join('; ');
	const state = authorize.searchParams.get('state');
	return auth.handler(
		new Request(`${LIBRARIAN}/api/auth/oauth2/callback/seilide?code=abc&state=${state}`, {
			headers: { cookie }
		})
	);
}

/** Una cuenta con contraseña creada desde su invitación, como /invitacion/<token>. */
async function signUpInvited(auth: Auth, email: string, name: string) {
	const invitations = invitationStore(tdb.db);
	const made = await invitations.invite(email, null);
	if (!made.ok) throw new Error(made.problem);
	const created = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name } });
	expect(await invitations.accept(made.token, created.user)).toBe(true);
	return created.user;
}

const usersCalled = (email: string) => tdb.db.select().from(user).where(eq(user.email, email));
const accountsOf = (userId: string) =>
	tdb.db.select().from(account).where(eq(account.userId, userId));

beforeEach(async () => {
	tdb = await createTestDb();
	sentVerification.mockClear();
});
afterEach(async () => {
	vi.unstubAllGlobals();
	await tdb.cleanup();
});

describe('Login con contraseña', () => {
	it('nadie se registra por HTTP: /sign-up/email está cerrado', async () => {
		const res = await createAuth().handler(
			new Request(`${LIBRARIAN}/api/auth/sign-up/email`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin: LIBRARIAN },
				body: JSON.stringify({ email: 'eva@example.com', password: PASSWORD, name: 'Eva' })
			})
		);
		expect(res.status).toBe(404);
		expect(await usersCalled('eva@example.com')).toHaveLength(0);
	});

	it('la cuenta creada desde la invitación queda verificada y entra con su contraseña', async () => {
		const auth = createAuth();
		const created = await signUpInvited(auth, 'ana@example.com', 'Ana');

		const [row] = await usersCalled('ana@example.com');
		expect(row.emailVerified).toBe(true);
		// La invitación ya verificó el email: no se manda otro enlace.
		expect(sentVerification).not.toHaveBeenCalled();

		const signedIn = await auth.api.signInEmail({
			body: { email: 'ana@example.com', password: PASSWORD }
		});
		expect(signedIn.user.id).toBe(created.id);
	});

	it('con la contraseña equivocada no entra', async () => {
		const auth = createAuth();
		await signUpInvited(auth, 'ana@example.com', 'Ana');
		const err = await auth.api
			.signInEmail({ body: { email: 'ana@example.com', password: 'otra-contraseña-mala' } })
			.catch((e) => e);
		expect(err).toBeInstanceOf(APIError);
		expect(err.body?.code).toBe('INVALID_EMAIL_OR_PASSWORD');
	});

	it('sin email verificado no entra, y se le manda el enlace', async () => {
		const auth = createAuth();
		await auth.api.signUpEmail({
			body: { email: 'leo@example.com', password: PASSWORD, name: 'Leo' }
		});
		const err = await auth.api
			.signInEmail({ body: { email: 'leo@example.com', password: PASSWORD } })
			.catch((e) => e);
		expect(err.body?.code).toBe('EMAIL_NOT_VERIFIED');
		expect(sentVerification).toHaveBeenCalledOnce();
	});
});

describe('Entrar con Seilide', () => {
	it('la primera vez crea la cuenta, sin invitación, y la guarda por su sub', async () => {
		const res = await signInWithSeilide(createAuth(), {
			sub: 'seilide-42',
			email: 'Ana@Example.com',
			email_verified: true,
			name: 'Ana'
		});
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toBe('/library');
		expect(res.headers.getSetCookie().join()).toContain('better-auth.session_token');

		const [ana] = await usersCalled('ana@example.com');
		expect(ana.emailVerified).toBe(true);
		const accounts = await accountsOf(ana.id);
		expect(accounts).toMatchObject([{ providerId: 'seilide', accountId: 'seilide-42' }]);
	});

	it('enlaza la cuenta que ya existía con ese email en vez de crear otra', async () => {
		const auth = createAuth();
		const ana = await signUpInvited(auth, 'ana@example.com', 'Ana');

		const res = await signInWithSeilide(auth, {
			sub: 'seilide-42',
			email: 'ana@example.com',
			email_verified: true,
			name: 'Ana G.'
		});
		expect(res.status).toBe(302);
		expect(await usersCalled('ana@example.com')).toHaveLength(1);
		const providers = (await accountsOf(ana.id)).map((a) => a.providerId).sort();
		// Su contraseña sigue valiendo: el email era suyo.
		expect(providers).toEqual(['credential', 'seilide']);
	});

	it('la reconoce por el sub aunque cambie el email en Seilide', async () => {
		const auth = createAuth();
		await signInWithSeilide(auth, {
			sub: 'seilide-42',
			email: 'ana@example.com',
			email_verified: true,
			name: 'Ana'
		});
		await signInWithSeilide(auth, {
			sub: 'seilide-42',
			email: 'ana@nuevo.example',
			email_verified: true,
			name: 'Ana'
		});
		const everyone = await tdb.db.select().from(user);
		expect(everyone).toHaveLength(1);
		expect(everyone[0].email).toBe('ana@example.com');
	});

	it('otro sub con el mismo email verificado se enlaza a la misma persona', async () => {
		const auth = createAuth();
		await signInWithSeilide(auth, {
			sub: 'seilide-42',
			email: 'ana@example.com',
			email_verified: true,
			name: 'Ana'
		});
		await signInWithSeilide(auth, {
			sub: 'seilide-99',
			email: 'ana@example.com',
			email_verified: true,
			name: 'Otra'
		});
		// Mismo email, mismo usuario: Seilide garantiza que el email verificado es de
		// quien entra, así que el segundo sub se enlaza a la misma persona.
		const [ana] = await usersCalled('ana@example.com');
		const subs = (await accountsOf(ana.id)).map((a) => a.accountId).sort();
		expect(subs).toEqual(['seilide-42', 'seilide-99']);
	});

	it('al enlazar una cuenta con el email sin verificar, se borra su contraseña', async () => {
		const auth = createAuth();
		// Alguien creó una cuenta con el email de Ana y nunca lo verificó.
		const impostor = await auth.api.signUpEmail({
			body: { email: 'ana@example.com', password: PASSWORD, name: 'Impostor' }
		});

		await signInWithSeilide(auth, {
			sub: 'seilide-42',
			email: 'ana@example.com',
			email_verified: true,
			name: 'Ana'
		});

		const accounts = await accountsOf(impostor.user.id);
		expect(accounts.map((a) => a.providerId)).toEqual(['seilide']);
		const [ana] = await usersCalled('ana@example.com');
		expect(ana.emailVerified).toBe(true);
		const err = await auth.api
			.signInEmail({ body: { email: 'ana@example.com', password: PASSWORD } })
			.catch((e) => e);
		expect(err).toBeInstanceOf(APIError);
	});

	it('con el email sin verificar en Seilide no se crea la cuenta', async () => {
		const res = await signInWithSeilide(createAuth(), {
			sub: 'seilide-7',
			email: 'ana@example.com',
			email_verified: false,
			name: 'Ana'
		});
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toContain('error=email_not_verified');
		expect(res.headers.getSetCookie().join()).not.toContain('better-auth.session_token');
		expect(await tdb.db.select().from(user)).toHaveLength(0);
		expect(await tdb.db.select().from(account)).toHaveLength(0);
	});

	it('con el email sin verificar en Seilide no se enlaza a la cuenta que ya existía', async () => {
		const auth = createAuth();
		const ana = await signUpInvited(auth, 'ana@example.com', 'Ana');

		const res = await signInWithSeilide(auth, {
			sub: 'seilide-intruso',
			email: 'ana@example.com',
			email_verified: false,
			name: 'Intruso'
		});
		expect(res.headers.get('location')).toContain('error=account_not_linked');
		expect(res.headers.getSetCookie().join()).not.toContain('better-auth.session_token');
		expect((await accountsOf(ana.id)).map((a) => a.providerId)).toEqual(['credential']);
	});

	it('quien ya está enlazado sigue entrando por su sub aunque Seilide deje de dar el email verificado', async () => {
		const auth = createAuth();
		await signInWithSeilide(auth, {
			sub: 'seilide-42',
			email: 'ana@example.com',
			email_verified: true,
			name: 'Ana'
		});
		const res = await signInWithSeilide(auth, {
			sub: 'seilide-42',
			email: 'ana@example.com',
			email_verified: false,
			name: 'Ana'
		});
		expect(res.headers.get('location')).toBe('/library');
		expect(res.headers.getSetCookie().join()).toContain('better-auth.session_token');
	});

	it('sin SEILIDE_* no hay ruta de Seilide', async () => {
		const res = await createAuth(null).handler(
			new Request(`${LIBRARIAN}/api/auth/sign-in/oauth2`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin: LIBRARIAN },
				body: JSON.stringify({ providerId: 'seilide', callbackURL: '/library' })
			})
		);
		expect(res.status).toBe(404);
	});
});
