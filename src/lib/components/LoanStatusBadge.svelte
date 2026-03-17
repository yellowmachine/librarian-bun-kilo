<script lang="ts">
	import { LOAN_STATUS } from '$lib/loanStatus';
	import type { LoanStatus } from '$lib/server/loans';

	interface Props {
		status: LoanStatus;
		/** 'short' usa label corta (lista), 'long' usa label larga (detalle) */
		variant?: 'short' | 'long';
	}

	let { status, variant = 'short' }: Props = $props();

	const config = $derived(LOAN_STATUS[status]);
	const label = $derived(variant === 'long' ? config.labelLong : config.label);
</script>

<span
	class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset {config.classes}"
>
	{label}
</span>
