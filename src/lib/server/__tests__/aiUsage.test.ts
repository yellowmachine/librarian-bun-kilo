import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '../db/test-db';

// aiUsage.ts escribe con withRLS (db/rls): se redirige a una base PGlite en
// memoria por test. La llamada a OpenRouter se simula con fetch.
const holder = vi.hoisted(() => ({ tdb: null as unknown as TestDb }));
vi.mock('../db/index', () => ({
	get db() {
		return holder.tdb.db;
	}
}));
vi.mock('../db/rls', () => ({
	withRLS: (userId: string, cb: (tx: unknown) => Promise<unknown>) =>
		holder.tdb.withRLS(userId, cb as never)
}));

import { openRouterChat } from '../openrouter';
import { getAiUsage, getMonthCostUsd, recordAiCall } from '../aiUsage';
import { aiUsageLog } from '../db/schema';

const ALICE = 'user-alice';
const BOB = 'user-bob';

function reply(body: unknown, ok = true, status = 200): Response {
	return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

const REQUEST = { model: 'google/gemini-2.5-flash-lite', max_tokens: 100, messages: [] };

async function rows() {
	return holder.tdb.asSuperuser((tx) => tx.select().from(aiUsageLog));
}

beforeEach(async () => {
	holder.tdb = await createTestDb();
	await holder.tdb.asSuperuser((tx) =>
		tx.execute(
			`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('${ALICE}', 'Alice', 'a@test.com', true, now(), now()), ('${BOB}', 'Bob', 'b@test.com', true, now(), now())` as string
		)
	);
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	holder.tdb.cleanup();
	vi.restoreAllMocks();
});

describe('openRouterChat registra cada llamada', () => {
	it('correcta: coste, tokens, modelo, id y nº de resultados', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(
			reply({
				id: 'gen-123',
				model: 'google/gemini-2.5-flash-lite-001',
				choices: [{ message: { content: '["a","b","c"]' } }],
				usage: { prompt_tokens: 1200, completion_tokens: 80, cost: 0.00042 }
			})
		);

		const value = await openRouterChat(apiKeyFor(), REQUEST, {
			label: 'test',
			timeoutMs: 1000,
			log: { userId: ALICE, kind: 'book_tags', subject: 'Dune' },
			parse: (m) => {
				const items = JSON.parse(m.content!) as string[];
				return { value: items, resultCount: items.length };
			}
		});

		expect(value).toEqual(['a', 'b', 'c']);
		const [row] = await rows();
		expect(row).toMatchObject({
			userId: ALICE,
			kind: 'book_tags',
			subject: 'Dune',
			success: true,
			error: null,
			resultCount: 3,
			model: 'google/gemini-2.5-flash-lite-001',
			generationId: 'gen-123',
			promptTokens: 1200,
			completionTokens: 80,
			costUsd: 0.00042
		});
		expect(row.durationMs).toBeGreaterThanOrEqual(0);
	});

	it('error HTTP: fallida, con el código y sin coste', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(reply({ error: 'no credits' }, false, 402));

		const value = await openRouterChat(apiKeyFor(), REQUEST, {
			label: 'test',
			timeoutMs: 1000,
			log: { userId: ALICE, kind: 'book_shelf_scan' },
			parse: () => ({ value: 1, resultCount: 1 })
		});

		expect(value).toBeNull();
		expect(await rows()).toMatchObject([
			{ success: false, error: 'HTTP 402', costUsd: null, model: REQUEST.model, subject: null }
		]);
	});

	it('respuesta que no se entiende: fallida, pero con el coste que sí se cobró', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(
			reply({ choices: [{ message: { content: 'no es JSON' } }], usage: { cost: 0.001 } })
		);

		const value = await openRouterChat(apiKeyFor(), REQUEST, {
			label: 'test',
			timeoutMs: 1000,
			log: { userId: ALICE, kind: 'movie_scan' },
			parse: (m) => ({ value: JSON.parse(m.content!), resultCount: 1 })
		});

		expect(value).toBeNull();
		expect(await rows()).toMatchObject([
			{ success: false, error: 'invalid response', costUsd: 0.001 }
		]);
	});

	it('fallo de red: fallida y no lanza', async () => {
		vi.spyOn(global, 'fetch').mockRejectedValueOnce(new TypeError('fetch failed'));
		const value = await openRouterChat(apiKeyFor(), REQUEST, {
			label: 'test',
			timeoutMs: 1000,
			log: { userId: ALICE, kind: 'book_tags' },
			parse: () => ({ value: 1, resultCount: 1 })
		});
		expect(value).toBeNull();
		expect(await rows()).toMatchObject([{ success: false, error: 'network error' }]);
	});

	it('sin contexto no registra nada', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(
			reply({ choices: [{ message: { content: 'x' } }], usage: { cost: 0.1 } })
		);
		await openRouterChat(apiKeyFor(), REQUEST, {
			label: 'test',
			timeoutMs: 1000,
			parse: () => ({ value: 1, resultCount: 1 })
		});
		expect(await rows()).toEqual([]);
	});

	it('si el registro falla, la llamada no se entera', async () => {
		await expect(
			recordAiCall(
				{ userId: 'no-existe', kind: 'book_tags' },
				{
					success: true,
					error: null,
					resultCount: 1,
					model: null,
					generationId: null,
					promptTokens: null,
					completionTokens: null,
					costUsd: 0.1,
					durationMs: 5
				}
			)
		).resolves.toBeUndefined();
	});
});

describe('consulta del consumo', () => {
	async function seed(
		userId: string,
		kind: string,
		costUsd: number | null,
		success: boolean,
		at: string
	) {
		await holder.tdb.asSuperuser((tx) =>
			tx.insert(aiUsageLog).values({
				id: `${userId}-${kind}-${at}`,
				userId,
				kind: kind as 'book_tags',
				costUsd,
				success,
				createdAt: new Date(at)
			})
		);
	}

	beforeEach(async () => {
		await seed(ALICE, 'book_tags', 0.001, true, '2026-10-30T10:00:00Z');
		await seed(ALICE, 'movie_scan', 0.004, true, '2026-11-02T10:00:00Z');
		await seed(ALICE, 'movie_scan', null, false, '2026-11-03T10:00:00Z');
		await seed(BOB, 'movie_scan', 9, true, '2026-11-03T10:00:00Z');
	});

	it('solo lo propio, de lo más reciente a lo más antiguo, con totales', async () => {
		const { entries, totals, byKind } = await getAiUsage(ALICE, {}, { limit: 50, offset: 0 });
		expect(entries.map((e) => e.createdAt.toISOString().slice(0, 10))).toEqual([
			'2026-11-03',
			'2026-11-02',
			'2026-10-30'
		]);
		expect(totals).toEqual({ calls: 3, failed: 1, costUsd: 0.005 });
		expect(byKind).toEqual({ book_tags: 0.001, movie_scan: 0.004 });
	});

	it('filtra por tipo, resultado y fechas; la paginación no cambia los totales', async () => {
		const scans = await getAiUsage(ALICE, { kind: 'movie_scan' }, { limit: 50, offset: 0 });
		expect(scans.totals.calls).toBe(2);

		const failed = await getAiUsage(ALICE, { success: false }, { limit: 50, offset: 0 });
		expect(failed.entries.map((e) => e.kind)).toEqual(['movie_scan']);

		const november = await getAiUsage(
			ALICE,
			{ from: new Date('2026-11-01T00:00:00Z'), to: new Date('2026-12-01T00:00:00Z') },
			{ limit: 1, offset: 0 }
		);
		expect(november.entries).toHaveLength(1);
		expect(november.totals).toEqual({ calls: 2, failed: 1, costUsd: 0.004 });
	});

	it('gasto del mes en curso', async () => {
		expect(await getMonthCostUsd(ALICE, new Date('2026-11-15T12:00:00Z'))).toBeCloseTo(0.004);
	});

	it('nadie lo modifica ni borra desde la app', async () => {
		await holder.tdb.withRLS(ALICE, async (tx) => {
			await tx.update(aiUsageLog).set({ costUsd: 0 });
			await tx.delete(aiUsageLog);
		});
		expect((await getAiUsage(ALICE, {}, { limit: 50, offset: 0 })).totals.costUsd).toBeCloseTo(
			0.005
		);
	});
});

function apiKeyFor() {
	return 'sk-or-test';
}
