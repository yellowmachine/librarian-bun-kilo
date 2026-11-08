import type { RequestEvent } from '@sveltejs/kit';
import {
	AI_CALL_KINDS,
	getAiUsage,
	type AiCallKind,
	type AiUsageFilter
} from '$lib/server/aiUsage';

const PAGE_SIZE = 50;
const PERIODS = ['month', 'last-month', '30d', 'year', 'all'] as const;
type Period = (typeof PERIODS)[number];

// Fechas del periodo elegido, en hora del servidor. `to` es exclusivo.
function periodRange(period: Period, now = new Date()): Pick<AiUsageFilter, 'from' | 'to'> {
	const y = now.getFullYear();
	const m = now.getMonth();
	switch (period) {
		case 'month':
			return { from: new Date(y, m, 1) };
		case 'last-month':
			return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) };
		case '30d':
			return { from: new Date(now.getTime() - 30 * 24 * 60 * 60_000) };
		case 'year':
			return { from: new Date(y, 0, 1) };
		default:
			return {};
	}
}

// Los filtros van en la URL (?kind=&status=&period=&page=): se pueden
// compartir y el botón «atrás» funciona.
export const load = async ({ locals, url }: RequestEvent) => {
	const kindParam = url.searchParams.get('kind');
	const kind = AI_CALL_KINDS.includes(kindParam as AiCallKind)
		? (kindParam as AiCallKind)
		: undefined;
	const statusParam = url.searchParams.get('status');
	const status = statusParam === 'ok' || statusParam === 'error' ? statusParam : '';
	const periodParam = url.searchParams.get('period') as Period;
	const period: Period = PERIODS.includes(periodParam) ? periodParam : 'month';
	const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);

	const filter: AiUsageFilter = {
		kind,
		success: status === '' ? undefined : status === 'ok',
		...periodRange(period)
	};
	const { entries, totals, byKind } = await getAiUsage(locals.user!.id, filter, {
		limit: PAGE_SIZE,
		offset: (page - 1) * PAGE_SIZE
	});

	return {
		entries,
		totals,
		byKind,
		filters: { kind: kind ?? '', status, period },
		page,
		pageCount: Math.max(1, Math.ceil(totals.calls / PAGE_SIZE)),
		kinds: [...AI_CALL_KINDS]
	};
};
