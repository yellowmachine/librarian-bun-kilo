import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '../test-db';
import { groups, groupMembers, groupInviteCodes } from '../schema';
import { eq, sql } from 'drizzle-orm';

const ALICE = 'user-alice';
const BOB = 'user-bob';
const CAROL = 'user-carol';

async function seedUsers(tdb: TestDb) {
	await tdb.asSuperuser(async (tx) => {
		await tx.execute(
			`
			INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
			VALUES
				('${ALICE}', 'Alice', 'alice@test.com', true, now(), now()),
				('${BOB}',   'Bob',   'bob@test.com',   true, now(), now()),
				('${CAROL}', 'Carol', 'carol@test.com', true, now(), now())
		` as string
		);
	});
}

// ─── groups ───────────────────────────────────────────────────────────────────

describe('RLS · groups', () => {
	let tdb: TestDb;
	beforeEach(async () => {
		tdb = await createTestDb();
		await seedUsers(tdb);

		// Grupo de Alice (ella es owner y miembro)
		await tdb.asSuperuser(async (tx) => {
			await tx.insert(groups).values({
				id: 'grp-alice',
				name: 'Club de Alice',
				createdBy: ALICE,
				createdAt: new Date(),
				updatedAt: new Date()
			});
			await tx.insert(groupMembers).values({
				groupId: 'grp-alice',
				userId: ALICE,
				role: 'owner',
				joinedAt: new Date()
			});
		});

		// Grupo de Bob (bob es owner, carol es miembro)
		await tdb.asSuperuser(async (tx) => {
			await tx.insert(groups).values({
				id: 'grp-bob',
				name: 'Club de Bob',
				createdBy: BOB,
				createdAt: new Date(),
				updatedAt: new Date()
			});
			await tx.insert(groupMembers).values([
				{ groupId: 'grp-bob', userId: BOB, role: 'owner', joinedAt: new Date() },
				{ groupId: 'grp-bob', userId: CAROL, role: 'member', joinedAt: new Date() }
			]);
		});
	});
	afterEach(() => tdb.cleanup());

	it('alice solo ve los grupos donde es miembro', async () => {
		const rows = await tdb.withRLS(ALICE, (tx) => tx.select().from(groups));
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe('grp-alice');
	});

	it('carol ve solo el grupo de bob donde está', async () => {
		const rows = await tdb.withRLS(CAROL, (tx) => tx.select().from(groups));
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe('grp-bob');
	});

	it('alice no puede ver el grupo de bob', async () => {
		const rows = await tdb.withRLS(ALICE, (tx) =>
			tx.select().from(groups).where(eq(groups.id, 'grp-bob'))
		);
		expect(rows).toHaveLength(0);
	});

	it('alice crea un grupo, entra como owner y le pone código, todo con RLS (createGroup)', async () => {
		await tdb.withRLS(ALICE, async (tx) => {
			await tx.insert(groups).values({ id: 'grp-alice-2', name: 'Otro club', createdBy: ALICE });
			await tx
				.insert(groupMembers)
				.values({ groupId: 'grp-alice-2', userId: ALICE, role: 'owner' });
			await tx.insert(groupInviteCodes).values({ groupId: 'grp-alice-2', code: 'ALICE2' });
		});
		const rows = await tdb.withRLS(ALICE, (tx) => tx.select().from(groups));
		expect(rows).toHaveLength(2);
	});

	it('nadie entra como owner en un grupo que no creó', async () => {
		await expect(
			tdb.withRLS(CAROL, (tx) =>
				tx.insert(groupMembers).values({ groupId: 'grp-alice', userId: CAROL, role: 'owner' })
			)
		).rejects.toThrow();
	});

	it('alice no puede crear un grupo a nombre de bob', async () => {
		await expect(
			tdb.withRLS(ALICE, (tx) =>
				tx.insert(groups).values({
					id: 'grp-fraud',
					name: 'Fraude',
					createdBy: BOB, // alice intenta crear con bob como creador
					createdAt: new Date(),
					updatedAt: new Date()
				})
			)
		).rejects.toThrow();
	});
});

// ─── group_members ────────────────────────────────────────────────────────────

describe('RLS · group_members', () => {
	let tdb: TestDb;
	beforeEach(async () => {
		tdb = await createTestDb();
		await seedUsers(tdb);

		await tdb.asSuperuser(async (tx) => {
			await tx.insert(groups).values({
				id: 'grp-1',
				name: 'Grupo 1',
				createdBy: ALICE,
				createdAt: new Date(),
				updatedAt: new Date()
			});
			await tx.insert(groupMembers).values([
				{ groupId: 'grp-1', userId: ALICE, role: 'owner', joinedAt: new Date() },
				{ groupId: 'grp-1', userId: BOB, role: 'member', joinedAt: new Date() }
			]);
		});
	});
	afterEach(() => tdb.cleanup());

	it('alice ve todos los miembros de su grupo', async () => {
		const rows = await tdb.withRLS(ALICE, (tx) =>
			tx.select().from(groupMembers).where(eq(groupMembers.groupId, 'grp-1'))
		);
		expect(rows).toHaveLength(2);
	});

	it('bob ve todos los miembros del grupo donde está', async () => {
		const rows = await tdb.withRLS(BOB, (tx) =>
			tx.select().from(groupMembers).where(eq(groupMembers.groupId, 'grp-1'))
		);
		expect(rows).toHaveLength(2);
	});

	it('carol no ve los miembros de grupos donde no está', async () => {
		const rows = await tdb.withRLS(CAROL, (tx) =>
			tx.select().from(groupMembers).where(eq(groupMembers.groupId, 'grp-1'))
		);
		expect(rows).toHaveLength(0);
	});

	it('carol no puede añadirse a un grupo sin invitación', async () => {
		// Carol no es miembro ni admin de grp-1, no puede insertar a otros
		await expect(
			tdb.withRLS(CAROL, (tx) =>
				tx.insert(groupMembers).values({
					groupId: 'grp-1',
					userId: CAROL,
					role: 'member',
					joinedAt: new Date()
				})
			)
		).rejects.toThrow();
	});

	it('alice (owner) puede añadir a carol al grupo', async () => {
		await tdb.withRLS(ALICE, (tx) =>
			tx.insert(groupMembers).values({
				groupId: 'grp-1',
				userId: CAROL,
				role: 'member',
				joinedAt: new Date()
			})
		);
		const rows = await tdb.asSuperuser((tx) =>
			tx.select().from(groupMembers).where(eq(groupMembers.groupId, 'grp-1'))
		);
		expect(rows).toHaveLength(3);
	});

	it('bob (member) no puede expulsar a alice (owner)', async () => {
		await tdb.withRLS(BOB, (tx) => tx.delete(groupMembers).where(eq(groupMembers.userId, ALICE)));
		// Alice sigue siendo miembro
		const rows = await tdb.asSuperuser((tx) =>
			tx.select().from(groupMembers).where(eq(groupMembers.userId, ALICE))
		);
		expect(rows).toHaveLength(1);
	});
});

// ─── group_invite_codes · unirse con código (joinGroupByCode) ────────────────

describe('RLS · unirse a un grupo con su código', () => {
	let tdb: TestDb;
	const withCode = (code: string) => sql`SELECT set_config('app.invite_code', ${code}, true)`;

	beforeEach(async () => {
		tdb = await createTestDb();
		await seedUsers(tdb);
		await tdb.asSuperuser(async (tx) => {
			await tx.insert(groups).values([
				{ id: 'grp-1', name: 'Club', createdBy: ALICE },
				{ id: 'grp-2', name: 'Otro', createdBy: BOB }
			]);
			await tx.insert(groupMembers).values([
				{ groupId: 'grp-1', userId: ALICE, role: 'owner' },
				{ groupId: 'grp-2', userId: BOB, role: 'owner' }
			]);
			await tx.insert(groupInviteCodes).values([
				{ groupId: 'grp-1', code: 'CODE1' },
				{ groupId: 'grp-2', code: 'CODE2' }
			]);
		});
	});
	afterEach(() => tdb.cleanup());

	it('carol no puede listar los códigos de grupos ajenos', async () => {
		const rows = await tdb.withRLS(CAROL, (tx) => tx.select().from(groupInviteCodes));
		expect(rows).toHaveLength(0);
	});

	it('alice ve el código de su grupo, y solo ese', async () => {
		const rows = await tdb.withRLS(ALICE, (tx) => tx.select().from(groupInviteCodes));
		expect(rows.map((r) => r.code)).toEqual(['CODE1']);
	});

	it('carol entra como member con el código del grupo', async () => {
		await tdb.withRLS(CAROL, async (tx) => {
			await tx.execute(withCode('CODE1'));
			const [found] = await tx
				.select()
				.from(groupInviteCodes)
				.where(eq(groupInviteCodes.code, 'CODE1'));
			expect(found.groupId).toBe('grp-1');
			await tx.insert(groupMembers).values({ groupId: 'grp-1', userId: CAROL, role: 'member' });
		});
		const rows = await tdb.withRLS(CAROL, (tx) => tx.select().from(groups));
		expect(rows.map((r) => r.id)).toEqual(['grp-1']);
	});

	it('con el código de un grupo no se entra en otro', async () => {
		await expect(
			tdb.withRLS(CAROL, async (tx) => {
				await tx.execute(withCode('CODE1'));
				await tx.insert(groupMembers).values({ groupId: 'grp-2', userId: CAROL, role: 'member' });
			})
		).rejects.toThrow();
	});

	it('con el código no se entra como admin', async () => {
		await expect(
			tdb.withRLS(CAROL, async (tx) => {
				await tx.execute(withCode('CODE1'));
				await tx.insert(groupMembers).values({ groupId: 'grp-1', userId: CAROL, role: 'admin' });
			})
		).rejects.toThrow();
	});
});
