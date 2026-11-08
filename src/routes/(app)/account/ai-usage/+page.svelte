<script lang="ts">
	import { AI_KIND_LABELS, errorLabel, formatUsd, resultLabel } from '$lib/aiUsageLabels';

	let { data } = $props();
	const { entries, totals, byKind, filters, kinds } = $derived(data);

	const PERIOD_LABELS: Record<string, string> = {
		month: 'Este mes',
		'last-month': 'El mes pasado',
		'30d': 'Últimos 30 días',
		year: 'Este año',
		all: 'Todo'
	};

	const kindTotals = $derived(
		Object.entries(byKind)
			.filter(([, cost]) => cost > 0)
			.sort((a, b) => b[1] - a[1])
	);

	// Mismos filtros, otra página
	function pageHref(n: number): string {
		const params = Object.entries({ ...filters, page: String(n) }).filter(([, v]) => v !== '');
		return `?${new URLSearchParams(params).toString()}`;
	}

	const when = (d: Date | string) =>
		new Date(d).toLocaleString('es-ES', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});

	const selectClass =
		'border border-paper-border bg-paper px-3 py-1.5 text-sm text-ink-muted focus:border-ink focus:ring-0';
</script>

<svelte:head><title>Consumo de IA · Librarian</title></svelte:head>

<div class="mx-auto max-w-2xl space-y-8">
	<div>
		<h1 class="font-serif text-2xl font-normal text-ink">Consumo de IA</h1>
		<p class="mt-1 text-sm text-ink-muted">
			Cada vez que Librarian usa la IA con tu clave de OpenRouter. El coste es el que informa
			OpenRouter en cada llamada, en dólares; tu saldo real está en
			<a
				href="https://openrouter.ai/activity"
				target="_blank"
				rel="noopener noreferrer"
				class="underline underline-offset-2 hover:text-ink">su panel de actividad</a
			>.
		</p>
	</div>

	<!-- ── Filtros ──────────────────────────────────────────────────────── -->
	<form method="GET" class="flex flex-wrap gap-2" data-sveltekit-keepfocus>
		<select
			name="period"
			aria-label="Periodo"
			value={filters.period}
			onchange={(e) => e.currentTarget.form?.requestSubmit()}
			class={selectClass}
		>
			{#each Object.entries(PERIOD_LABELS) as [value, label] (value)}
				<option {value}>{label}</option>
			{/each}
		</select>
		<select
			name="kind"
			aria-label="Tipo"
			value={filters.kind}
			onchange={(e) => e.currentTarget.form?.requestSubmit()}
			class={selectClass}
		>
			<option value="">Todos los tipos</option>
			{#each kinds as kind (kind)}
				<option value={kind}>{AI_KIND_LABELS[kind] ?? kind}</option>
			{/each}
		</select>
		<select
			name="status"
			aria-label="Resultado"
			value={filters.status}
			onchange={(e) => e.currentTarget.form?.requestSubmit()}
			class={selectClass}
		>
			<option value="">Correctas y fallidas</option>
			<option value="ok">Solo correctas</option>
			<option value="error">Solo fallidas</option>
		</select>
		<noscript><button type="submit" class={selectClass}>Filtrar</button></noscript>
	</form>

	<!-- ── Resumen ──────────────────────────────────────────────────────── -->
	<div class="grid grid-cols-3 gap-px border border-paper-border bg-paper-border">
		{#each [{ label: 'Gasto', value: formatUsd(totals.costUsd) }, { label: 'Llamadas', value: String(totals.calls) }, { label: 'Fallidas', value: String(totals.failed) }] as tile (tile.label)}
			<div class="bg-paper px-4 py-4">
				<p class="text-xs font-medium tracking-widest text-ink-faint uppercase">{tile.label}</p>
				<p class="mt-1 text-lg font-medium text-ink">{tile.value}</p>
			</div>
		{/each}
	</div>

	{#if kindTotals.length > 1}
		<ul class="space-y-1.5 text-sm">
			{#each kindTotals as [kind, cost] (kind)}
				<li class="flex justify-between gap-4">
					<span class="text-ink-muted">{AI_KIND_LABELS[kind] ?? kind}</span>
					<span class="text-ink">{formatUsd(cost)}</span>
				</li>
			{/each}
		</ul>
	{/if}

	<!-- ── Llamadas ─────────────────────────────────────────────────────── -->
	{#if entries.length === 0}
		<p class="py-12 text-center text-sm text-ink-faint">
			No hay llamadas a la IA {filters.period === 'all'
				? 'con estos filtros'
				: `en «${PERIOD_LABELS[filters.period].toLowerCase()}» con estos filtros`}.
		</p>
	{:else}
		<ul class="divide-y divide-paper-border border-y border-paper-border">
			{#each entries as entry (entry.id)}
				<li class="space-y-1 py-3">
					<div class="flex items-baseline justify-between gap-4">
						<p class="min-w-0 truncate text-sm text-ink">
							<span class="font-medium">{AI_KIND_LABELS[entry.kind] ?? entry.kind}</span>
							{#if entry.subject}
								<span class="text-ink-muted"> · {entry.subject}</span>
							{/if}
						</p>
						<span class="shrink-0 text-sm text-ink">{formatUsd(entry.costUsd)}</span>
					</div>
					<p class="text-xs {entry.success ? 'text-ink-muted' : 'text-red-700'}">
						{#if entry.success}
							{entry.resultCount !== null ? resultLabel(entry.kind, entry.resultCount) : 'Correcta'}
						{:else}
							{errorLabel(entry.error)}
						{/if}
					</p>
					<p class="text-[11px] text-ink-faint">
						{when(entry.createdAt)}
						{#if entry.model}· {entry.model}{/if}
						{#if entry.promptTokens !== null}
							· {entry.promptTokens + (entry.completionTokens ?? 0)} tokens
						{/if}
						{#if entry.durationMs !== null}· {(entry.durationMs / 1000).toFixed(1)} s{/if}
					</p>
				</li>
			{/each}
		</ul>

		{#if data.pageCount > 1}
			<nav class="flex items-center justify-between text-sm" aria-label="Páginas">
				{#if data.page > 1}
					<a href={pageHref(data.page - 1)} class="text-ink-muted hover:text-ink">← Más recientes</a
					>
				{:else}
					<span></span>
				{/if}
				<span class="text-xs text-ink-faint">Página {data.page} de {data.pageCount}</span>
				{#if data.page < data.pageCount}
					<a href={pageHref(data.page + 1)} class="text-ink-muted hover:text-ink">Más antiguas →</a>
				{:else}
					<span></span>
				{/if}
			</nav>
		{/if}
	{/if}
</div>
