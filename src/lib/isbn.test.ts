import { describe, it, expect } from 'vitest';
import { cleanIsbn, firstValidIsbn, isValidIsbn } from './isbn';

describe('cleanIsbn', () => {
	it('quita prefijo, guiones y espacios', () => {
		expect(cleanIsbn('ISBN: 978-84-376-0494-7')).toBe('9788437604947');
		expect(cleanIsbn('ISBN-10 0-8044-2957-x')).toBe('080442957X');
	});
});

describe('isValidIsbn', () => {
	it('acepta ISBN-13 e ISBN-10 con su dígito de control', () => {
		expect(isValidIsbn('978-84-376-0494-7')).toBe(true);
		expect(isValidIsbn('9780945466376')).toBe(true);
		expect(isValidIsbn('0945466374')).toBe(true);
		expect(isValidIsbn('080442957X')).toBe(true);
	});

	it('rechaza un dígito mal leído', () => {
		expect(isValidIsbn('9788437604948')).toBe(false);
		expect(isValidIsbn('9788437605947')).toBe(false);
		expect(isValidIsbn('0945466375')).toBe(false);
	});

	it('rechaza un EAN-13 válido que no es de libro', () => {
		expect(isValidIsbn('4006381333931')).toBe(false);
	});

	it('rechaza longitudes raras y la X fuera de su sitio', () => {
		expect(isValidIsbn('978843760494')).toBe(false);
		expect(isValidIsbn('X945466374')).toBe(false);
		expect(isValidIsbn('')).toBe(false);
	});
});

describe('firstValidIsbn', () => {
	it('prefiere el de 13 cifras y descarta los inválidos', () => {
		expect(firstValidIsbn(['0945466374', '9788437604948', '978-84-376-0494-7'])).toBe(
			'9788437604947'
		);
		expect(firstValidIsbn(['0945466374'])).toBe('0945466374');
		expect(firstValidIsbn(['123', 'abc'])).toBeNull();
	});
});
