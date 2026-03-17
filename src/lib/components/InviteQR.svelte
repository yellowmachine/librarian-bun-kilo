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
		class="flex items-center gap-1.5 border border-neutral-200 px-3 py-2 text-xs text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-900"
	>
		<QrCode size={14} />
		{visible ? 'Ocultar QR' : 'Mostrar QR'}
	</button>

	{#if visible}
		<div class="mt-4 flex flex-col items-center gap-4 border border-neutral-200 p-6">
			<div class="w-48">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html qrSvg}
			</div>
			<p class="text-center text-xs text-neutral-400">Escanea para unirte al grupo</p>
			<p class="text-center font-mono text-xs break-all text-neutral-300">{joinUrl}</p>
		</div>
	{/if}
</div>
