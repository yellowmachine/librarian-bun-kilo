// Clases de los formularios de las páginas sin sesión, las mismas que los de la app.
export const label = 'block text-xs font-medium tracking-widest text-ink-muted uppercase';
export const input =
	'mt-1.5 block w-full border-0 border-b border-paper-border bg-transparent px-0 py-2 text-sm text-ink placeholder-ink-faint focus:border-brown-600 focus:ring-0';
export const primary = 'w-full border py-2.5 text-sm btn-primary disabled:opacity-60';
export const secondary = 'w-full border py-2.5 text-sm btn-secondary disabled:opacity-60';
export const problem = 'border border-ink bg-paper-ui px-4 py-2.5 text-sm text-ink';

/** Una ruta propia a la que volver tras entrar (`?next=`), nunca otra web. */
export function safeNext(next: string | null, fallback = '/library'): string {
	return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
		? next
		: fallback;
}
