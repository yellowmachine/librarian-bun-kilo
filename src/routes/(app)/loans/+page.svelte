<script lang="ts">
	import type { LoanWithDetails } from '$lib/server/loans';
	import { ArrowsLeftRight } from 'phosphor-svelte';

	let { data } = $props();
	const { asOwner, asBorrower } = data;

	let activeTab = $state<'borrower' | 'owner'>('borrower');

	const ACTIVE = new Set(['requested', 'accepted', 'active', 'return_requested']);

	function sortLoans(list: LoanWithDetails[]): LoanWithDetails[] {
		return [...list].sort((a, b) => {
			const aA = ACTIVE.has(a.status) ? 0 : 1;
			const bA = ACTIVE.has(b.status) ? 0 : 1;
			if (aA !== bA) return aA - bA;
			return new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime();
		});
	}

	const sortedBorrower = $derived(sortLoans(asBorrower as LoanWithDetails[]));
	const sortedOwner = $derived(sortLoans(asOwner as LoanWithDetails[]));

	const pendingBorrower = $derived(
		(asBorrower as LoanWithDetails[]).filter((l) => ACTIVE.has(l.status)).length
	);
	const pendingOwner = $derived(
		(asOwner as LoanWithDetails[]).filter((l) => ACTIVE.has(l.status)).length
	);

	const STATUS_LABEL: Record<string, string> = {
		requested: 'Solicitado',
		accepted: 'Aceptado',
		active: 'Activo',
		return_requested: 'Dev. solicitada',
		returned: 'Devuelto',
		rejected: 'Rechazado',
		cancelled: 'Cancelado'
	};
</script>

<div class="space-y-8">
	<div>
		<h1 class="font-serif text-3xl font-normal text-neutral-900">Préstamos</h1>
	</div>

	<!-- Tabs -->
	<div class="border-b border-neutral-100">
		<nav class="flex gap-6">
			{#each [{ key: 'borrower', label: 'Libros que pido', count: pendingBorrower }, { key: 'owner', label: 'Libros que presto', count: pendingOwner }] as tab}
				<button
					onclick={() => (activeTab = tab.key as 'borrower' | 'owner')}
					class="flex items-center gap-2 border-b-2 pb-3 text-sm transition-colors
					{activeTab === tab.key
						? 'border-neutral-900 font-medium text-neutral-900'
						: 'border-transparent text-neutral-400 hover:text-neutral-700'}"
				>
					{tab.label}
					{#if tab.count > 0}
						<span
							class="flex h-4 w-4 items-center justify-center rounded-full bg-neutral-900 text-[10px] text-white"
						>
							{tab.count}
						</span>
					{/if}
				</button>
			{/each}
		</nav>
	</div>

	{#snippet loanList(list: LoanWithDetails[], role: 'borrower' | 'owner')}
		{#if list.length === 0}
			<div class="flex flex-col items-center py-20 text-center">
				<ArrowsLeftRight size={40} weight="thin" class="mb-4 text-neutral-200" />
				<p class="text-sm text-neutral-400">
					{role === 'borrower'
						? 'No has solicitado ningún préstamo.'
						: 'Nadie te ha pedido ningún libro.'}
				</p>
			</div>
		{:else}
			<ul class="divide-y divide-neutral-100">
				{#each list as loan (loan.id)}
					<li>
						<a
							href="/loans/{loan.id}"
							class="-mx-2 flex items-center gap-4 px-2 py-4 hover:bg-neutral-50"
						>
							{#if loan.coverUrl}
								<img
									src={loan.coverUrl}
									alt={loan.title}
									class="h-14 w-10 flex-shrink-0 object-cover"
								/>
							{:else}
								<div
									class="flex h-14 w-10 flex-shrink-0 items-center justify-center bg-neutral-100 font-serif text-xs text-neutral-300"
								>
									?
								</div>
							{/if}
							<div class="min-w-0 flex-1">
								<p class="truncate font-medium text-neutral-900">{loan.title}</p>
								<p class="truncate text-xs text-neutral-400">
									{role === 'borrower' ? loan.ownerName : loan.borrowerName}
								</p>
								<p class="text-xs text-neutral-300">
									{new Date(loan.requestedAt).toLocaleDateString('es-ES', {
										day: 'numeric',
										month: 'short',
										year: 'numeric'
									})}
								</p>
							</div>
							<div class="shrink-0 text-right">
								<span
									class="text-xs
								{ACTIVE.has(loan.status) ? 'font-medium text-neutral-900' : 'text-neutral-400'}"
								>
									{STATUS_LABEL[loan.status] ?? loan.status}
								</span>
							</div>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	{/snippet}

	{#if activeTab === 'borrower'}
		{@render loanList(sortedBorrower, 'borrower')}
	{:else}
		{@render loanList(sortedOwner, 'owner')}
	{/if}
</div>
