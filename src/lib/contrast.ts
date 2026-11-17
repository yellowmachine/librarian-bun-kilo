// Preferencia de contraste. Va en una cookie (por dispositivo): hooks.server.ts
// la pone como data-contrast en <html> antes de enviar la página, sin parpadeo.
// "system" sigue a prefers-contrast del sistema operativo (en layout.css).

export const CONTRAST_COOKIE = 'contrast';

export const CONTRAST_OPTIONS = ['system', 'normal', 'more'] as const;
export type Contrast = (typeof CONTRAST_OPTIONS)[number];

export function parseContrast(value: string | null | undefined): Contrast {
	return CONTRAST_OPTIONS.includes(value as Contrast) ? (value as Contrast) : 'system';
}
