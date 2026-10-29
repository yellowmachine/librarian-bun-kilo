import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../db/test-db';
import { invitations, user } from '../db/schema';
import { invitationStore, type InvitationStore } from '../invitation-store';

let tdb: TestDb;
let store: InvitationStore;

async function addUser(id: string, email: string, verified = false) {
	await tdb.db.insert(user).values({ id, name: id, email, emailVerified: verified });
}

beforeEach(async () => {
	tdb = await createTestDb();
	store = invitationStore(tdb.db);
	await addUser('alice', 'alice@example.com', true);
});
afterEach(() => tdb.cleanup());

describe('invitaciones', () => {
	it('invita por email y el enlace dice para quién es y quién invita', async () => {
		const made = await store.invite(' Eva@Example.com ', 'alice');
		expect(made.ok).toBe(true);
		if (!made.ok) return;
		const found = await store.byToken(made.token);
		expect(found).toMatchObject({
			email: 'Eva@Example.com',
			status: 'pending',
			inviterName: 'alice',
			hasAccount: false
		});
	});

	it('no invita a quien ya tiene cuenta, ni a algo que no es un email', async () => {
		expect(await store.invite('ALICE@example.com', 'alice')).toMatchObject({ ok: false });
		expect(await store.invite('no-es-un-email', 'alice')).toMatchObject({ ok: false });
	});

	it('invitar otra vez al mismo email renueva el enlace: el viejo deja de valer', async () => {
		const first = await store.invite('eva@example.com', 'alice');
		const second = await store.invite('EVA@example.com', 'alice');
		if (!first.ok || !second.ok) throw new Error('no invitó');
		expect(second.id).toBe(first.id);
		expect(await store.byToken(first.token)).toBeNull();
		expect(await tdb.db.select().from(invitations)).toHaveLength(1);
	});

	it('aceptarla la marca usada y verifica el email de la cuenta', async () => {
		const made = await store.invite('eva@example.com', 'alice');
		if (!made.ok) throw new Error('no invitó');
		await addUser('eva', 'eva@example.com');

		expect(await store.accept(made.token, { id: 'eva', email: 'eva@example.com' })).toBe(true);
		const [eva] = await tdb.db.select().from(user).where(eq(user.id, 'eva'));
		expect(eva.emailVerified).toBe(true);
		expect((await store.byToken(made.token))?.status).toBe('accepted');
		// Una vez usada, no vale otra vez.
		expect(await store.accept(made.token, { id: 'eva', email: 'eva@example.com' })).toBe(false);
	});

	it('no la acepta una cuenta con otro email', async () => {
		const made = await store.invite('eva@example.com', 'alice');
		if (!made.ok) throw new Error('no invitó');
		await addUser('mallory', 'mallory@example.com');
		expect(await store.accept(made.token, { id: 'mallory', email: 'mallory@example.com' })).toBe(
			false
		);
		const [mallory] = await tdb.db.select().from(user).where(eq(user.id, 'mallory'));
		expect(mallory.emailVerified).toBe(false);
	});

	it('caducada o cancelada, ya no vale', async () => {
		const made = await store.invite('eva@example.com', 'alice');
		if (!made.ok) throw new Error('no invitó');
		await tdb.db
			.update(invitations)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(invitations.id, made.id));
		expect((await store.byToken(made.token))?.status).toBe('expired');
		expect(await store.accept(made.token, { id: 'x', email: 'eva@example.com' })).toBe(false);

		const other = await store.invite('leo@example.com', 'alice');
		if (!other.ok) throw new Error('no invitó');
		expect(await store.cancel(other.id, 'otro-usuario')).toBe(false);
		expect(await store.cancel(other.id, 'alice')).toBe(true);
		expect((await store.byToken(other.token))?.status).toBe('cancelled');
	});

	it('cada uno ve las que ha mandado', async () => {
		await store.invite('eva@example.com', 'alice');
		await store.invite('leo@example.com', null);
		expect((await store.sentBy('alice')).map((i) => i.email)).toEqual(['eva@example.com']);
	});

	it('sabe si aún no hay ninguna cuenta (para la primera invitación)', async () => {
		expect(await store.noAccountsYet()).toBe(false);
		await tdb.db.delete(user);
		expect(await store.noAccountsYet()).toBe(true);
	});
});
