// Los colores de tag son elegidos libremente por el usuario (input type="color"),
// así que amarillos, naranjas o verdes claros quedan casi ilegibles como texto
// sobre el fondo claro de la app. Este helper conserva el matiz (hue) pero
// oscurece el color hasta alcanzar una luminancia relativa (WCAG) legible,
// en vez de limitarse a la L de HSL — un amarillo puro ya tiene L=50% en HSL
// pero una luminancia percibida altísima, así que solo mirar L no bastaba.

function hexToRgb(hex: string): { r: number; g: number; b: number } {
	return {
		r: parseInt(hex.slice(1, 3), 16),
		g: parseInt(hex.slice(3, 5), 16),
		b: parseInt(hex.slice(5, 7), 16)
	};
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
	const linear = (channel: number) => {
		const c = channel / 255;
		return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
	const { r: r255, g: g255, b: b255 } = hexToRgb(hex);
	const r = r255 / 255;
	const g = g255 / 255;
	const b = b255 / 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;

	if (max === min) return { h: 0, s: 0, l: l * 100 };

	const d = max - min;
	const s = d / (1 - Math.abs(2 * l - 1));

	let h: number;
	switch (max) {
		case r:
			h = ((g - b) / d) % 6;
			break;
		case g:
			h = (b - r) / d + 2;
			break;
		default:
			h = (r - g) / d + 4;
	}
	h *= 60;
	if (h < 0) h += 360;

	return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
	const sN = s / 100;
	const lN = l / 100;
	const c = (1 - Math.abs(2 * lN - 1)) * sN;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = lN - c / 2;

	let r = 0;
	let g = 0;
	let b = 0;
	if (h < 60) [r, g, b] = [c, x, 0];
	else if (h < 120) [r, g, b] = [x, c, 0];
	else if (h < 180) [r, g, b] = [0, c, x];
	else if (h < 240) [r, g, b] = [0, x, c];
	else if (h < 300) [r, g, b] = [x, 0, c];
	else [r, g, b] = [c, 0, x];

	const toHex = (v: number) =>
		Math.round((v + m) * 255)
			.toString(16)
			.padStart(2, '0');

	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Luminancia máxima admitida para el texto: el fondo "paper" (#f9f7f4) tiene
// luminancia ≈ 0.93, así que 0.168 sería el límite exacto para 4.5:1 (AA).
// Se deja algo de margen porque la búsqueda avanza en pasos de L, no es exacta.
const MAX_TEXT_LUMINANCE = 0.14;
const MIN_LIGHTNESS_FLOOR = 8;
const LIGHTNESS_STEP = 2;
const MIN_SATURATION = 35;

/**
 * Devuelve una variante del color del tag apta para usarse como color de
 * texto: mismo matiz, oscurecida progresivamente hasta que su luminancia
 * relativa sea lo bastante baja como para leerse sobre el fondo claro de
 * la app. Los colores ya oscuros se devuelven sin cambios.
 */
export function readableTagTextColor(hex: string | null | undefined): string | null {
	if (!hex) return null;
	if (relativeLuminance(hexToRgb(hex)) <= MAX_TEXT_LUMINANCE) return hex;

	const { h, s, l } = hexToHsl(hex);
	const saturation = Math.max(s, MIN_SATURATION);

	let lightness = l;
	let candidate = hex;
	while (lightness > MIN_LIGHTNESS_FLOOR) {
		lightness -= LIGHTNESS_STEP;
		candidate = hslToHex(h, saturation, lightness);
		if (relativeLuminance(hexToRgb(candidate)) <= MAX_TEXT_LUMINANCE) break;
	}
	return candidate;
}
