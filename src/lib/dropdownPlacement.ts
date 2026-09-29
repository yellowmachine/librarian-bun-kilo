// Calcula hacia dónde abrir un desplegable y cuánto puede crecer, descontando
// las barras fijas del layout (cabecera sticky y barra de navegación inferior
// en mobile, marcadas con data-top-bar / data-bottom-bar) y el teclado
// virtual, que reduce el visualViewport.

export interface DropdownPlacement {
	direction: 'down' | 'up';
	maxHeight: number;
}

const PREFERRED_HEIGHT = 256;
// Por debajo de esto se prefiere abrir hacia arriba si allí hay más sitio
const MIN_COMFORTABLE_HEIGHT = 160;
const GAP = 8;

function visibleRect(selector: string): DOMRect | null {
	const el = document.querySelector(selector);
	if (!el) return null;
	const rect = el.getBoundingClientRect();
	// display:none (p.ej. la barra inferior en sm+) da un rect vacío
	return rect.height > 0 ? rect : null;
}

export function computeDropdownPlacement(anchor: HTMLElement): DropdownPlacement {
	const rect = anchor.getBoundingClientRect();
	const vv = window.visualViewport;
	const viewportTop = vv?.offsetTop ?? 0;
	const viewportBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;

	const topLimit = Math.max(viewportTop, visibleRect('[data-top-bar]')?.bottom ?? 0);
	const bottomLimit = Math.min(
		viewportBottom,
		visibleRect('[data-bottom-bar]')?.top ?? Number.POSITIVE_INFINITY
	);

	const below = bottomLimit - rect.bottom - GAP;
	const above = rect.top - topLimit - GAP;

	if (below >= MIN_COMFORTABLE_HEIGHT || below >= above) {
		return { direction: 'down', maxHeight: Math.max(0, Math.min(PREFERRED_HEIGHT, below)) };
	}
	return { direction: 'up', maxHeight: Math.max(0, Math.min(PREFERRED_HEIGHT, above)) };
}

/**
 * Recalcula la posición mientras el desplegable está abierto (scroll,
 * resize, aparición del teclado). Devuelve la función de limpieza.
 */
export function trackDropdownPlacement(
	anchor: HTMLElement,
	onChange: (placement: DropdownPlacement) => void
): () => void {
	const update = () => onChange(computeDropdownPlacement(anchor));
	update();
	window.addEventListener('scroll', update, { capture: true, passive: true });
	window.addEventListener('resize', update);
	window.visualViewport?.addEventListener('resize', update);
	window.visualViewport?.addEventListener('scroll', update);
	return () => {
		window.removeEventListener('scroll', update, { capture: true });
		window.removeEventListener('resize', update);
		window.visualViewport?.removeEventListener('resize', update);
		window.visualViewport?.removeEventListener('scroll', update);
	};
}
