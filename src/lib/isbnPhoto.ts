// Lee el código de barras de una FOTO (no del vídeo en directo), gratis y en
// el navegador. Una foto fija suele salir más nítida que los fotogramas del
// vídeo, así que esto resuelve muchos casos antes de recurrir a la IA.
//
// Primero el lector nativo (BarcodeDetector: Chrome/Android, Safari reciente),
// que es rápido y bueno; si no existe o no encuentra nada, Quagga sobre la
// imagen. Solo se acepta un ISBN que pase el dígito de control.
import { cleanIsbn, isValidIsbn } from './isbn';

type Detector = { detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]> };
type DetectorClass = {
	new (options: { formats: string[] }): Detector;
	getSupportedFormats?: () => Promise<string[]>;
};

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new window.Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error('Could not read image'));
		img.src = src;
	});
}

async function withNativeDetector(dataUrl: string): Promise<string[]> {
	const Native = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
	if (!Native) return [];
	try {
		const supported = (await Native.getSupportedFormats?.()) ?? ['ean_13'];
		if (!supported.includes('ean_13')) return [];
		const found = await new Native({ formats: ['ean_13'] }).detect(await loadImage(dataUrl));
		return found.map((b) => b.rawValue);
	} catch {
		return [];
	}
}

async function withQuagga(dataUrl: string): Promise<string[]> {
	try {
		const Quagga = (await import('@ericblade/quagga2')).default;
		const codes: string[] = [];
		// Dos pasadas: a tamaño medio y grande. Según lo lejos que esté el código
		// en la foto, una encuentra lo que la otra no.
		for (const size of [800, 1600]) {
			const result = await Quagga.decodeSingle({
				src: dataUrl,
				numOfWorkers: 0,
				locate: true,
				inputStream: { size },
				decoder: { readers: ['ean_reader'] }
			});
			const code = result?.codeResult?.code;
			if (code) codes.push(code);
			if (code && isValidIsbn(code)) break;
		}
		return codes;
	} catch {
		return [];
	}
}

/** El ISBN del código de barras de la foto, o null si no se pudo leer uno válido. */
export async function decodeIsbnFromPhoto(dataUrl: string): Promise<string | null> {
	for (const decode of [withNativeDetector, withQuagga]) {
		const valid = (await decode(dataUrl)).map(cleanIsbn).find(isValidIsbn);
		if (valid) return valid;
	}
	return null;
}
