import { describe, it, expect } from 'vitest';
import { itemCountLabel } from './itemCounts';

describe('itemCountLabel', () => {
	it('solo lo que no es cero, en singular o plural', () => {
		expect(itemCountLabel(3, 1)).toBe('3 books · 1 movie');
		expect(itemCountLabel(1, 0)).toBe('1 book');
		expect(itemCountLabel(0, 2)).toBe('2 movies');
		expect(itemCountLabel(0, 0)).toBe('');
	});
});
