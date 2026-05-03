<script lang="ts">
	import { enhance, applyAction, deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { ArrowLeft, BookOpen } from 'phosphor-svelte';
	import type { LoanWithDetails } from '$lib/server/loans';
	import LoanStatusBadge from '$lib/components/LoanStatusBadge.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	let { data, form } = $props();
	const loan = $derived(data.loan as LoanWithDetails);
	const currentUserId = $derived(data.currentUserId as string);

	let confirmMessage = $state('');
	let pendingForm = $state<HTMLFormElement | null>(null);

	function openConfirm(message: string, formEl: HTMLFormElement): void {
		confirmMessage = message;
		pendingForm = formEl;
	}

	async function submitConfirmed() {
		if (!pendingForm) return;
		const formEl = pendingForm;
		pendingForm = null;
		const response = await fetch(formEl.action, {
			method: 'POST',
			body: new FormData(formEl),
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result = deserialize(await response.text());
		await applyAction(result);
		invalidateAll();
	}

	const isOwner = $derived(loan.ownerId === currentUserId);
	const isBorrower = $derived(loan.borrowerId === currentUserId);

	type Action = {
		label: string;
		toStatus: string;
		variant: 'primary' | 'danger' | 'ghost';
		confirm?: string;
	};

	const actions = $derived((): Action[] => {
		const s = loan.status;
		if (isOwner) {
			if (s === 'requested')
				return [
					{ label: 'Accept request', toStatus: 'accepted', variant: 'primary' },
					{
						label: 'Reject',
						toStatus: 'rejected',
						variant: 'danger',
						confirm: 'Reject this request?'
					}
				];
			if (s === 'accepted')
				return [{ label: 'Mark as delivered', toStatus: 'active', variant: 'primary' }];
			if (s === 'return_requested')
				return [
					{ label: 'Confirm return', toStatus: 'returned', variant: 'primary' },
					{ label: 'keep loan', toStatus: 'active', variant: 'ghost' }
				];
		}
		if (isBorrower) {
			if (s === 'requested')
				return [
					{
						label: 'Cancel the request?',
						toStatus: 'cancelled',
						variant: 'danger',
						confirm: '¿Cancel?'
					}
				];
			if (s === 'accepted')
				return [
					{
						label: 'Cancel',
						toStatus: 'cancelled',
						variant: 'danger',
						confirm: 'Cancel the loan?'
					}
				];
			if (s === 'active')
				return [{ label: 'Request return', toStatus: 'return_requested', variant: 'ghost' }];
		}
		return [];
	});

	const timeline = $derived(() =>
		[
			{ label: 'Requested', date: loan.requestedAt },
			{ label: 'Accepted', date: loan.acceptedAt },
			{ label: 'Delivered', date: loan.activeAt },
			{ label: 'Return requested', date: loan.returnRequestedAt },
			{ label: 'Returned', date: loan.returnedAt }
		].filter((e) => e.date !== null)
	);

	function fmt(d: Date | null) {
		if (!d) return '';
		return new Date(d).toLocaleDateString('es-ES', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}
</script>

<div class="mx-auto max-w-md space-y-10">
	<a href="/loans" class="inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink">
		<ArrowLeft size={16} /> Loans
	</a>

	{#if form?.error}
		<p class="border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{form.error}</p>
	{/if}

	<!-- Libro -->
	<div class="flex gap-5">
		{#if loan.coverUrl}
			<img
				src={loan.coverUrl}
				alt={loan.title}
				class="h-32 w-22 flex-shrink-0 object-cover shadow-sm"
			/>
		{:else}
			<div class="flex h-32 w-22 flex-shrink-0 items-center justify-center bg-paper-ui">
				<BookOpen size={28} weight="thin" class="text-ink-faint" />
			</div>
		{/if}
		<div class="min-w-0 space-y-2 pt-1">
			<h1 class="font-serif text-2xl leading-tight font-normal text-ink">{loan.title}</h1>
			{#if loan.authors.length > 0}
				<p class="text-sm text-ink-muted">{loan.authors.join(', ')}</p>
			{/if}
			<LoanStatusBadge status={loan.status} variant="long" />
		</div>
	</div>

	<!-- Partes -->
	<div class="grid grid-cols-2 gap-px border border-paper-border bg-paper-border">
		<div class="bg-paper px-4 py-4">
			<p class="text-xs font-medium tracking-widest text-ink-faint uppercase">Owner</p>
			<p class="mt-1 font-medium text-ink">{isOwner ? 'You' : loan.ownerName}</p>
		</div>
		<div class="bg-paper px-4 py-4">
			<p class="text-xs font-medium tracking-widest text-ink-faint uppercase">Borrower</p>
			<p class="mt-1 font-medium text-ink">{isBorrower ? 'You' : loan.borrowerName}</p>
		</div>
		{#if loan.dueDate}
			<div class="col-span-2 bg-paper px-4 py-4">
				<p class="text-xs font-medium tracking-widest text-ink-faint uppercase">Deadline</p>
				<p class="mt-1 text-sm text-ink">{fmt(loan.dueDate)}</p>
			</div>
		{/if}
		{#if loan.notes}
			<div class="col-span-2 bg-paper px-4 py-4">
				<p class="text-xs font-medium tracking-widest text-ink-faint uppercase">
					Message from borrower
				</p>
				<p class="mt-1 text-sm text-ink-muted">{loan.notes}</p>
			</div>
		{/if}
		{#if loan.ownerNotes}
			<div class="col-span-2 bg-paper px-4 py-4">
				<p class="text-xs font-medium tracking-widest text-ink-faint uppercase">
					Message from owner
				</p>
				<p class="mt-1 text-sm text-ink-muted">{loan.ownerNotes}</p>
			</div>
		{/if}
	</div>

	<!-- Timeline -->
	{#if timeline().length > 0}
		<div class="space-y-3">
			<p class="text-xs font-medium tracking-widest text-ink-faint uppercase">History</p>
			<ol class="space-y-2 border-l border-paper-border pl-4">
				{#each timeline() as ev (ev.label)}
					<li class="flex items-baseline justify-between gap-4 text-sm">
						<span class="text-ink-muted">{ev.label}</span>
						<span class="shrink-0 text-xs text-ink-faint">{fmt(ev.date)}</span>
					</li>
				{/each}
			</ol>
		</div>
	{/if}

	<!-- Acciones -->
	{#if actions().length > 0}
		<div class="space-y-2 border-t border-paper-border pt-4">
			{#each actions() as action (action.toStatus)}
				{#snippet formBody()}
					<input type="hidden" name="toStatus" value={action.toStatus} />
					{#if action.toStatus === 'accepted'}
						<textarea
							name="ownerNotes"
							placeholder="Message to the borrower (optional)"
							rows="2"
							class="mb-2 w-full resize-none border border-paper-border bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:ring-0 focus:outline-none"
						></textarea>
					{/if}
					<button
						type="submit"
						class="w-full py-2.5 text-sm transition-colors
						{action.variant === 'primary' ? 'border border-ink bg-ink text-paper hover:bg-ink/90' : ''}
						{action.variant === 'danger'
							? 'border border-paper-border text-red-500 hover:border-red-300 hover:bg-red-50'
							: ''}
						{action.variant === 'ghost'
							? 'border border-paper-border text-ink-muted hover:border-ink-faint'
							: ''}"
					>
						{action.label}
					</button>
				{/snippet}

				{#if action.confirm}
					<form
						method="POST"
						action="?/transition"
						onsubmit={(e) => {
							e.preventDefault();
							openConfirm(action.confirm!, e.currentTarget as HTMLFormElement);
						}}
					>
						{@render formBody()}
					</form>
				{:else}
					<form method="POST" action="?/transition" use:enhance>
						{@render formBody()}
					</form>
				{/if}
			{/each}
		</div>
	{/if}

	{#if pendingForm}
		<ConfirmDialog
			message={confirmMessage}
			onconfirm={submitConfirmed}
			oncancel={() => {
				pendingForm = null;
			}}
		/>
	{/if}
</div>
