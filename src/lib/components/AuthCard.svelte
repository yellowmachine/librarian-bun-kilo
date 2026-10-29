<script lang="ts">
	import type { Snippet } from 'svelte';

	// El marco de las páginas sin sesión (login, invitación, contraseña olvidada).
	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-paper px-4 py-10">
	<div class="w-full max-w-sm">
		<div class="text-center">
			<p class="font-serif text-4xl font-normal tracking-tight text-ink">librarian</p>
			<p class="mt-2 text-sm text-ink-faint">Tu biblioteca particular</p>
		</div>
		<h1 class="mt-10 text-center text-sm font-medium text-ink">{title}</h1>
		<div class="mt-6">
			{@render children()}
		</div>
	</div>
</div>
