import { describe, it, expect, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const inserted: { table: unknown; values: unknown }[] = [];

vi.mock('$lib/server/books', () => ({
	getUserBooks: vi.fn(),
	resolveBook: vi.fn(async () => ({ id: 'OL1W', title: 'Dune', coverUrl: null })),
	upsertBook: vi.fn(async () => 'OL1W'),
	addBookToLibrary: vi.fn(async () => 'ub-1')
}));

vi.mock('$lib/server/db/rls', () => ({
	withRLS: async (_userId: string, fn: (tx: unknown) => Promise<unknown>) =>
		fn({
			insert: (table: unknown) => ({
				values: (values: unknown) => {
					inserted.push({ table, values });
					return { onConflictDoNothing: async () => {} };
				}
			})
		})
}));

import { POST } from './+server';
import { tags } from '$lib/server/db/schema';

function post(body: unknown) {
	return POST({
		locals: { user: { id: 'u1' } },
		request: new Request('http://localhost/api/books', {
			method: 'POST',
			body: JSON.stringify(body)
		})
	} as unknown as RequestEvent);
}

describe('POST /api/books', () => {
	it('acepta etiquetas nuevas sin color (las que propone la IA)', async () => {
		const res = await post({
			workId: 'OL1W',
			tagsToCreate: [
				{ name: 'Ciencia ficción', color: null },
				{ name: 'Clásicos', color: '#aa5500' }
			]
		});

		expect(res.status).toBe(201);
		const created = inserted.filter((i) => i.table === tags).map((i) => i.values);
		expect(created).toMatchObject([
			{ name: 'Ciencia ficción', color: null },
			{ name: 'Clásicos', color: '#aa5500' }
		]);
	});
});
