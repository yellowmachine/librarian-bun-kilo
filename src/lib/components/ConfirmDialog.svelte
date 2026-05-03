<script lang="ts">
	type Props = {
		message: string;
		onconfirm: () => void;
		oncancel: () => void;
	};

	let { message, onconfirm, oncancel }: Props = $props();
</script>

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
	role="dialog"
	aria-modal="true"
>
	<div class="w-full max-w-sm border border-paper-border bg-paper px-6 py-5 shadow-lg">
		<p class="text-sm text-ink">{message}</p>
		<div class="mt-5 flex justify-end gap-2">
			<button
				type="button"
				onclick={oncancel}
				class="border border-paper-border px-4 py-1.5 text-sm text-ink-muted hover:border-ink-faint"
			>
				Cancel
			</button>
			<button
				type="button"
				onclick={onconfirm}
				class="border border-red-300 bg-red-50 px-4 py-1.5 text-sm text-red-600 hover:bg-red-100"
			>
				Confirm
			</button>
		</div>
	</div>
</div>
