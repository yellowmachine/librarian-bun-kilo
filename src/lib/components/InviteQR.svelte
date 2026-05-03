<script lang="ts">
	import { encodeQR } from '@paulmillr/qr';
	import { page } from '$app/state';
	import { QrCode } from 'phosphor-svelte';

	interface Props {
		inviteCode: string;
	}

	let { inviteCode }: Props = $props();

	let visible = $state(false);

	const joinUrl = $derived(`${page.url.origin}/groups/join/${inviteCode}`);

	const qrSvg = $derived(encodeQR(joinUrl, 'svg'));
</script>

<div>
	<button
		type="button"
		onclick={() => (visible = !visible)}
		class="flex items-center gap-1.5 border border-paper-border px-3 py-2 text-xs text-ink-muted transition-colors hover:border-ink-faint hover:text-ink"
	>
		<QrCode size={14} />
		{visible ? 'Hide QR' : 'Show QR'}
	</button>

	{#if visible}
		<div class="mt-4 flex flex-col items-center gap-4 border border-paper-border p-6">
			<div class="w-48">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html qrSvg}
			</div>
			<p class="text-center text-xs text-ink-faint">Scan to join the group</p>
			<p class="text-center font-mono text-xs break-all text-ink-faint">{joinUrl}</p>
		</div>
	{/if}
</div>
