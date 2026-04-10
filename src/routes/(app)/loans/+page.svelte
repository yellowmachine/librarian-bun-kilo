<script lang="ts">
	import type { LoanWithDetails } from '$lib/server/loans';
	import { ArrowsLeftRight } from 'phosphor-svelte';
	import LoanStatusBadge from '$lib/components/LoanStatusBadge.svelte';

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
</script>

<div class="space-y-8">
	<div>
		<h1 class="font-serif text-3xl font-normal text-ink">Loans</h1>
	</div>

	<!-- Tabs -->
	<div class="border-b border-paper-border">
		<nav class="flex gap-6">
			{#each [{ key: 'borrower', label: 'Books I request', count: pendingBorrower }, { key: 'owner', label: 'Books I lend', count: pendingOwner }] as tab}
				<button
					onclick={() => (activeTab = tab.key as 'borrower' | 'owner')}
					class="flex items-center gap-2 border-b-2 pb-3 text-sm transition-colors
					{activeTab === tab.key
						? 'border-ink font-medium text-ink'
						: 'border-transparent text-ink-faint hover:text-ink-muted'}"
				>
					{tab.label}
					{#if tab.count > 0}
						<span
							class="flex h-4 w-4 items-center justify-center rounded-full bg-ink text-[10px] text-paper"
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
				<ArrowsLeftRight size={40} weight="thin" class="mb-4 text-ink-faint" />
				<p class="text-sm text-ink-faint">
					{role === 'borrower'
						? 'You have not applied for any loan.'
						: 'No one has asked you for any books.'}
				</p>
			</div>
		{:else}
			<ul class="divide-y divide-paper-border">
				{#each list as loan (loan.id)}
					<li>
						<a
							href="/loans/{loan.id}"
							class="-mx-2 flex items-center gap-4 px-2 py-4 hover:bg-paper-ui"
						>
							{#if loan.coverUrl}
								<img
									src={loan.coverUrl}
									alt={loan.title}
									class="h-14 w-10 flex-shrink-0 object-cover"
								/>
							{:else}
								<div
									class="flex h-14 w-10 flex-shrink-0 items-center justify-center bg-paper-ui font-serif text-xs text-ink-faint"
								>
									?
								</div>
							{/if}
							<div class="min-w-0 flex-1">
								<p class="truncate font-medium text-ink">{loan.title}</p>
								<p class="truncate text-xs text-ink-faint">
									{role === 'borrower' ? loan.ownerName : loan.borrowerName}
								</p>
								<p class="text-xs text-ink-faint">
									{new Date(loan.requestedAt).toLocaleDateString('es-ES', {
										day: 'numeric',
										month: 'short',
										year: 'numeric'
									})}
								</p>
							</div>
							<div class="shrink-0">
								<LoanStatusBadge status={loan.status} />
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
