import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { tagChipStyle } from './tagColor';

// Lee los colores de layout.css (tema normal en @theme, alto contraste en el
// bloque `@variant hc` de :root) y comprueba los contrastes WCAG que importan.

const css = readFileSync(new URL('../routes/layout.css', import.meta.url), 'utf8');

function vars(block: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const m of block.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
	return out;
}

const normal = vars(css.slice(css.indexOf('@theme {'), css.indexOf('}', css.indexOf('@theme {'))));
const hcStart = css.indexOf('@variant hc {', css.indexOf(':root {'));
const hc = { ...normal, ...vars(css.slice(hcStart, css.indexOf('}', hcStart))) };

function luminance(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

// Cada color, sobre los dos fondos de la app
const BACKGROUNDS = ['paper', 'paper-ui'];

describe('tema normal', () => {
	it.each([
		['ink', 4.5],
		['ink-muted', 4.5],
		['ink-faint', 4.5],
		['brown-600', 4.5] // enlaces y acciones
	])('%s se lee (≥ %s:1)', (token, min) => {
		for (const bg of BACKGROUNDS)
			expect(contrast(normal[token], normal[bg]), `${token} / ${bg}`).toBeGreaterThanOrEqual(min);
	});

	it.each([['field'], ['brown-500']])('el borde %s se ve (≥ 3:1)', (token) => {
		for (const bg of BACKGROUNDS)
			expect(contrast(normal[token], normal[bg]), `${token} / ${bg}`).toBeGreaterThanOrEqual(3);
	});
});

describe('alto contraste', () => {
	it.each([['ink'], ['ink-muted'], ['ink-faint'], ['brown-600'], ['red-700'], ['accent']])(
		'%s pasa AAA (≥ 7:1)',
		(token) => {
			for (const bg of BACKGROUNDS)
				expect(contrast(hc[token], hc[bg]), `${token} / ${bg}`).toBeGreaterThanOrEqual(7);
		}
	);

	it.each([['paper-border'], ['field'], ['brown-300'], ['brown-500'], ['red-200'], ['star-empty']])(
		'el borde %s se ve (≥ 3:1)',
		(token) => {
			for (const bg of BACKGROUNDS)
				expect(contrast(hc[token], hc[bg]), `${token} / ${bg}`).toBeGreaterThanOrEqual(3);
		}
	);

	it('el botón principal se lee', () => {
		expect(contrast(hc['brown-50'], hc['brown-700'])).toBeGreaterThanOrEqual(7);
	});

	it('las etiquetas, con cualquier color, pasan 7:1 y se leen al seleccionarlas', () => {
		for (const color of ['#ffff00', '#00ff00', '#ff8800', '#00ffff', '#ff00ff', '#cccccc']) {
			const fg = tagChipStyle(color).match(/--tag-fg-hc: (#[0-9a-f]{6})/)![1];
			for (const bg of BACKGROUNDS)
				expect(contrast(fg, hc[bg]), `${color} / ${bg}`).toBeGreaterThanOrEqual(7);
			// Seleccionada: texto del color del papel sobre el color del tag
			expect(contrast(hc.paper, fg), `${color} seleccionada`).toBeGreaterThanOrEqual(7);
		}
	});
});
