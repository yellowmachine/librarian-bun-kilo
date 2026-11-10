import { describe, expect, it } from 'vitest';
import { plausibleCoverBox } from './image';

describe('plausibleCoverBox', () => {
	it('acepta una carátula que ocupa buena parte de la foto', () => {
		// Foto vertical 1200×1600, carátula de DVD casi a sangre
		expect(plausibleCoverBox([0.05, 0.1, 0.95, 0.9], 1200, 1600)).toEqual([0.05, 0.1, 0.95, 0.9]);
	});

	it('rechaza una caja diminuta (una letra del título)', () => {
		expect(plausibleCoverBox([0.4, 0.3, 0.5, 0.38], 1200, 1600)).toBeNull();
	});

	it('rechaza una franja con forma imposible para una carátula', () => {
		// Ancha y baja: la línea del título, no la caja
		expect(plausibleCoverBox([0.3, 0, 0.55, 1], 1600, 1200)).toBeNull();
	});

	it('sin caja, null', () => {
		expect(plausibleCoverBox(null, 1200, 1600)).toBeNull();
	});
});
