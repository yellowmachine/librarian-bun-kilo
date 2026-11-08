// Registro del consumo de IA de cada usuario (ai_usage_log): lo escribe
// openRouterChat (openrouter.ts) en cada llamada y lo lee /account/ai-usage.
import { nanoid } from 'nanoid';
import { and, desc, eq, gte, lt, sql, type SQL } from 'drizzle-orm';
import { aiUsageLog, aiCallKindEnum } from './db/schema';
import { withRLS } from './db/rls';

export const AI_CALL_KINDS = aiCallKindEnum.enumValues;
export type AiCallKind = (typeof AI_CALL_KINDS)[number];

/** Quién y para qué: lo pone quien llama a la función de IA. */
export interface AiLogContext {
	userId: string;
	kind: AiCallKind;
	/** De qué iba: título del libro o la película (null en las fotos) */
	subject?: string | null;
}

export interface AiCallOutcome {
	success: boolean;
	error: string | null;
	resultCount: number | null;
	model: string | null;
	generationId: string | null;
	promptTokens: number | null;
	completionTokens: number | null;
	costUsd: number | null;
	durationMs: number;
}

/**
 * Nunca lanza: si el registro falla, la función de IA ya hizo su trabajo y el
 * usuario no tiene por qué enterarse; queda en el log del servidor.
 */
export async function recordAiCall(ctx: AiLogContext, outcome: AiCallOutcome): Promise<void> {
	try {
		await withRLS(ctx.userId, (tx) =>
			tx.insert(aiUsageLog).values({
				id: nanoid(),
				userId: ctx.userId,
				kind: ctx.kind,
				subject: ctx.subject?.slice(0, 300) || null,
				...outcome
			})
		);
	} catch (e) {
		console.error('recordAiCall: could not record AI usage', e);
	}
}

// ─── Consulta ─────────────────────────────────────────────────────────────────

export type AiUsageFilter = {
	kind?: AiCallKind;
	/** true: solo correctas; false: solo fallidas */
	success?: boolean;
	from?: Date;
	/** Exclusivo */
	to?: Date;
};

export type AiUsageEntry = typeof aiUsageLog.$inferSelect;

export type AiUsageTotals = {
	calls: number;
	failed: number;
	costUsd: number;
};

function whereFor(userId: string, f: AiUsageFilter): SQL | undefined {
	return and(
		eq(aiUsageLog.userId, userId),
		f.kind ? eq(aiUsageLog.kind, f.kind) : undefined,
		f.success !== undefined ? eq(aiUsageLog.success, f.success) : undefined,
		f.from ? gte(aiUsageLog.createdAt, f.from) : undefined,
		f.to ? lt(aiUsageLog.createdAt, f.to) : undefined
	);
}

export async function getAiUsage(
	userId: string,
	filter: AiUsageFilter,
	page: { limit: number; offset: number }
): Promise<{ entries: AiUsageEntry[]; totals: AiUsageTotals; byKind: Record<string, number> }> {
	return withRLS(userId, async (tx) => {
		const where = whereFor(userId, filter);

		const entries = await tx
			.select()
			.from(aiUsageLog)
			.where(where)
			.orderBy(desc(aiUsageLog.createdAt))
			.limit(page.limit)
			.offset(page.offset);

		const [totals] = await tx
			.select({
				calls: sql<number>`count(*)::int`,
				failed: sql<number>`count(*) filter (where not ${aiUsageLog.success})::int`,
				costUsd: sql<number>`coalesce(sum(${aiUsageLog.costUsd}), 0)::float8`
			})
			.from(aiUsageLog)
			.where(where);

		const kindRows = await tx
			.select({
				kind: aiUsageLog.kind,
				costUsd: sql<number>`coalesce(sum(${aiUsageLog.costUsd}), 0)::float8`
			})
			.from(aiUsageLog)
			.where(where)
			.groupBy(aiUsageLog.kind);

		return {
			entries,
			totals,
			byKind: Object.fromEntries(kindRows.map((r) => [r.kind, r.costUsd]))
		};
	});
}

/** Gasto en dólares del mes en curso (para /account). */
export async function getMonthCostUsd(userId: string, now = new Date()): Promise<number> {
	const from = new Date(now.getFullYear(), now.getMonth(), 1);
	const { totals } = await getAiUsage(userId, { from }, { limit: 0, offset: 0 });
	return totals.costUsd;
}
