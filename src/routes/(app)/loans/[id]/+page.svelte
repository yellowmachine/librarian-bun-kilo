<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowLeft, BookOpen } from 'phosphor-svelte';
	import type { LoanWithDetails } from '$lib/server/loans';
	import LoanStatusBadge from '$lib/components/LoanStatusBadge.svelte';

	let { data, form } = $props();
	const loan = $derived(data.loan as LoanWithDetails);
	const currentUserId = $derived(data.currentUserId as string);

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
					{ label: 'Aceptar solicitud', toStatus: 'accepted', variant: 'primary' },
					{
						label: 'Rechazar',
						toStatus: 'rejected',
						variant: 'danger',
						confirm: '¿Rechazar esta solicitud?'
					}
				];
			if (s === 'accepted')
				return [{ label: 'Marcar como entregado', toStatus: 'active', variant: 'primary' }];
			if (s === 'return_requested')
				return [
					{ label: 'Confirmar devolución', toStatus: 'returned', variant: 'primary' },
					{ label: 'Mantener préstamo', toStatus: 'active', variant: 'ghost' }
				];
		}
		if (isBorrower) {
			if (s === 'requested')
				return [
					{
						label: 'Cancelar solicitud',
						toStatus: 'cancelled',
						variant: 'danger',
						confirm: '¿Cancelar?'
					}
				];
			if (s === 'accepted')
				return [
					{
						label: 'Cancelar',
						toStatus: 'cancelled',
						variant: 'danger',
						confirm: '¿Cancelar el préstamo?'
					}
				];
			if (s === 'active')
				return [{ label: 'Solicitar devolución', toStatus: 'return_requested', variant: 'ghost' }];
		}
		return [];
	});

	const timeline = $derived(() =>
		[
			{ label: 'Solicitado', date: loan.requestedAt },
			{ label: 'Aceptado', date: loan.acceptedAt },
			{ label: 'Entregado', date: loan.activeAt },
			{ label: 'Dev. solicitada', date: loan.returnRequestedAt },
			{ label: 'Devuelto', date: loan.returnedAt }
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
	<a
		href="/loans"
		class="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-900"
	>
		<ArrowLeft size={16} /> Préstamos
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
			<div class="flex h-32 w-22 flex-shrink-0 items-center justify-center bg-neutral-100">
				<BookOpen size={28} weight="thin" class="text-neutral-300" />
			</div>
		{/if}
		<div class="min-w-0 space-y-2 pt-1">
			<h1 class="font-serif text-2xl leading-tight font-normal text-neutral-900">{loan.title}</h1>
			{#if loan.authors.length > 0}
				<p class="text-sm text-neutral-500">{loan.authors.join(', ')}</p>
			{/if}
			<LoanStatusBadge status={loan.status} variant="long" />
		</div>
	</div>

	<!-- Partes -->
	<div class="grid grid-cols-2 gap-px border border-neutral-200 bg-neutral-200">
		<div class="bg-white px-4 py-4">
			<p class="text-xs font-medium tracking-widest text-neutral-400 uppercase">Propietario</p>
			<p class="mt-1 font-medium text-neutral-900">{isOwner ? 'Tú' : loan.ownerName}</p>
		</div>
		<div class="bg-white px-4 py-4">
			<p class="text-xs font-medium tracking-widest text-neutral-400 uppercase">Prestatario</p>
			<p class="mt-1 font-medium text-neutral-900">{isBorrower ? 'Tú' : loan.borrowerName}</p>
		</div>
		{#if loan.dueDate}
			<div class="col-span-2 bg-white px-4 py-4">
				<p class="text-xs font-medium tracking-widest text-neutral-400 uppercase">Fecha límite</p>
				<p class="mt-1 text-sm text-neutral-900">{fmt(loan.dueDate)}</p>
			</div>
		{/if}
		{#if loan.notes}
			<div class="col-span-2 bg-white px-4 py-4">
				<p class="text-xs font-medium tracking-widest text-neutral-400 uppercase">Notas</p>
				<p class="mt-1 text-sm text-neutral-700">{loan.notes}</p>
			</div>
		{/if}
	</div>

	<!-- Timeline -->
	{#if timeline().length > 0}
		<div class="space-y-3">
			<p class="text-xs font-medium tracking-widest text-neutral-400 uppercase">Historial</p>
			<ol class="space-y-2 border-l border-neutral-200 pl-4">
				{#each timeline() as ev}
					<li class="flex items-baseline justify-between gap-4 text-sm">
						<span class="text-neutral-700">{ev.label}</span>
						<span class="shrink-0 text-xs text-neutral-400">{fmt(ev.date)}</span>
					</li>
				{/each}
			</ol>
		</div>
	{/if}

	<!-- Acciones -->
	{#if actions().length > 0}
		<div class="space-y-2 border-t border-neutral-100 pt-4">
			{#each actions() as action}
				<form
					method="POST"
					action="?/transition"
					use:enhance
					onsubmit={(e) => {
						if (action.confirm && !confirm(action.confirm)) e.preventDefault();
					}}
				>
					<input type="hidden" name="toStatus" value={action.toStatus} />
					<button
						type="submit"
						class="w-full py-2.5 text-sm transition-colors
						{action.variant === 'primary'
							? 'border border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800'
							: ''}
						{action.variant === 'danger'
							? 'border border-neutral-200 text-red-500 hover:border-red-300 hover:bg-red-50'
							: ''}
						{action.variant === 'ghost'
							? 'border border-neutral-200 text-neutral-600 hover:border-neutral-400'
							: ''}"
					>
						{action.label}
					</button>
				</form>
			{/each}
		</div>
	{/if}
</div>
