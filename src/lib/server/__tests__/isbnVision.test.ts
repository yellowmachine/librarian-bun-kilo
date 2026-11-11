import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../aiUsage', () => ({ recordAiCall: vi.fn() }));

import { readIsbnFromImage, toReadIsbns } from '../isbnVision';
import { recordAiCall } from '../aiUsage';

function modelReply(items: unknown): Response {
	return {
		ok: true,
		json: async () => ({ choices: [{ message: { content: JSON.stringify(items) } }] })
	} as Response;
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.mocked(recordAiCall).mockReset();
});

describe('toReadIsbns', () => {
	it('limpia, descarta lo que no tiene longitud de ISBN y no repite', () => {
		expect(
			toReadIsbns(['ISBN 978-84-376-0494-7', '9788437604947', 9780945466376, '12,95 €', null])
		).toEqual(['9788437604947', '9780945466376']);
	});
});

describe('readIsbnFromImage', () => {
	it('devuelve el ISBN que pasa el dígito de control y apunta cuántos son válidos', async () => {
		// El primero tiene una cifra mal leída.
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(modelReply(['9788437604948', '84-376-0494-x']));

		const reading = await readIsbnFromImage('key', 'data:image/jpeg;base64,AAAA', {
			userId: 'u1',
			kind: 'book_isbn_scan'
		});

		expect(reading).toEqual({ isbn: '843760494X', read: ['9788437604948', '843760494X'] });
		const [ctx, call] = vi.mocked(recordAiCall).mock.calls[0];
		expect(ctx.kind).toBe('book_isbn_scan');
		expect(call.resultCount).toBe(1);
	});

	it('si ninguno es válido, isbn null pero cuenta lo leído', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValueOnce(modelReply(['9788437604948']));
		expect(await readIsbnFromImage('key', 'data:image/jpeg;base64,AAAA')).toEqual({
			isbn: null,
			read: ['9788437604948']
		});
	});

	it('null si la llamada falla', async () => {
		vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('offline'));
		vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await readIsbnFromImage('key', 'data:image/jpeg;base64,AAAA')).toBeNull();
	});
});
