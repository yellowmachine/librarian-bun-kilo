// Validación de ISBN por su dígito de control. La usan tanto el navegador (lo
// que lee el lector de códigos en una foto) como el servidor (lo que lee la
// IA): un dígito mal leído casi siempre rompe el control, así que nunca se
// busca un ISBN equivocado o inventado.

/** Quita guiones, espacios y el prefijo "ISBN"; la X final en mayúscula. */
export function cleanIsbn(raw: string): string {
	return raw
		.replace(/^\s*ISBN(?:-1[03])?:?/i, '')
		.replace(/[^0-9Xx]/g, '')
		.toUpperCase();
}

function isValidIsbn13(code: string): boolean {
	// Un EAN-13 de libro empieza por 978 o 979 (el resto son otros productos).
	if (!/^97[89]\d{10}$/.test(code)) return false;
	let sum = 0;
	for (let i = 0; i < 13; i++) sum += Number(code[i]) * (i % 2 === 0 ? 1 : 3);
	return sum % 10 === 0;
}

function isValidIsbn10(code: string): boolean {
	if (!/^\d{9}[\dX]$/.test(code)) return false;
	let sum = 0;
	for (let i = 0; i < 10; i++) {
		const digit = code[i] === 'X' ? 10 : Number(code[i]);
		sum += digit * (10 - i);
	}
	return sum % 11 === 0;
}

export function isValidIsbn(raw: string): boolean {
	const code = cleanIsbn(raw);
	return isValidIsbn13(code) || isValidIsbn10(code);
}

/** El primero que sea un ISBN válido, ya limpio; los de 13 cifras primero. null si ninguno. */
export function firstValidIsbn(candidates: string[]): string | null {
	const valid = candidates.map(cleanIsbn).filter(isValidIsbn);
	return valid.find((c) => c.length === 13) ?? valid[0] ?? null;
}
