import { describe, it, expect } from 'vitest';
import { errorLabel, formatUsd, resultLabel } from './aiUsageLabels';

// Intl usa espacios no separables: se normalizan para comparar.
const plain = (s: string) => s.replace(/\s/g, ' ');

describe('textos del consumo de IA', () => {
	it('formatea el coste en dólares, incluidas fracciones de céntimo', () => {
		expect(plain(formatUsd(0.00042))).toBe('0,0004 US$');
		expect(plain(formatUsd(1.5))).toBe('1,50 US$');
		expect(plain(formatUsd(0))).toBe('0,00 US$');
		expect(plain(formatUsd(0.00001))).toBe('< 0,0001 US$');
		expect(formatUsd(null)).toBe('—');
	});

	it('explica resultados y errores', () => {
		expect(resultLabel('movie_scan', 1)).toBe('1 película reconocida');
		expect(resultLabel('book_tags', 3)).toBe('3 etiquetas sugeridas');
		expect(errorLabel('HTTP 402')).toBe('Sin saldo en OpenRouter');
		expect(errorLabel('HTTP 500')).toBe('HTTP 500');
	});
});
