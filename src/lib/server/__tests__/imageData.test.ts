import { describe, it, expect } from 'vitest';
import { decodeImageDataUrl, sniffImageType } from '../imageData';

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 1]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const WEBP = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');

const toDataUrl = (bytes: Uint8Array, type = 'image/jpeg') =>
	`data:${type};base64,${Buffer.from(bytes).toString('base64')}`;

describe('sniffImageType', () => {
	it('reconoce JPEG, PNG y WebP por sus bytes', () => {
		expect(sniffImageType(JPEG)).toBe('image/jpeg');
		expect(sniffImageType(PNG)).toBe('image/png');
		expect(sniffImageType(WEBP)).toBe('image/webp');
		expect(sniffImageType(SVG)).toBeNull();
	});
});

describe('decodeImageDataUrl', () => {
	it('el tipo sale de los bytes, no del data URL', () => {
		expect(decodeImageDataUrl(toDataUrl(PNG, 'image/jpeg'), 1000)?.contentType).toBe('image/png');
	});

	it('rechaza lo que no es imagen aunque diga serlo', () => {
		expect(decodeImageDataUrl(toDataUrl(SVG, 'image/svg+xml'), 1000)).toBeNull();
		expect(decodeImageDataUrl(toDataUrl(SVG, 'image/jpeg'), 1000)).toBeNull();
		expect(decodeImageDataUrl('https://example.com/a.jpg', 1000)).toBeNull();
	});

	it('respeta el tamaño máximo', () => {
		const big = new Uint8Array(2000);
		big.set(JPEG);
		expect(decodeImageDataUrl(toDataUrl(big), 1999)).toBeNull();
		expect(decodeImageDataUrl(toDataUrl(big), 2000)?.bytes.length).toBe(2000);
	});
});
