// Soportes de la videoteca. Mismo orden y valores que el enum media_format de
// la base de datos (src/lib/server/db/schema.ts).
export const MEDIA_FORMATS = ['dvd', 'bluray', 'uhd_bluray'] as const;
export type MediaFormat = (typeof MEDIA_FORMATS)[number];

export const MEDIA_FORMAT_LABELS: Record<MediaFormat, string> = {
	dvd: 'DVD',
	bluray: 'Blu-ray',
	uhd_bluray: '4K Blu-ray'
};

export function isMediaFormat(value: unknown): value is MediaFormat {
	return typeof value === 'string' && (MEDIA_FORMATS as readonly string[]).includes(value);
}

/** "Blu-ray · Steelbook" — la línea bajo el póster en la cuadrícula. */
export function formatLine(format: MediaFormat, edition: string | null): string {
	return edition ? `${MEDIA_FORMAT_LABELS[format]} · ${edition}` : MEDIA_FORMAT_LABELS[format];
}
