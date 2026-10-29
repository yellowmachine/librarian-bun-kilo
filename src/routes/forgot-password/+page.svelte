<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import { input, label, primary, problem } from '$lib/auth-form';

	let { form } = $props();
</script>

<svelte:head><title>Contraseña olvidada · Librarian</title></svelte:head>

<AuthCard title="He olvidado mi contraseña">
	{#if form?.sent}
		<p class="text-center text-sm text-ink-muted">
			Si <span class="text-ink">{form.email}</span> tiene cuenta, le hemos mandado un enlace para elegir
			una contraseña nueva. Caduca en una hora.
		</p>
	{:else}
		<form method="POST" use:enhance class="space-y-5">
			{#if form?.message}
				<p class={problem} role="alert">{form.message}</p>
			{/if}
			<div>
				<label for="email" class={label}>Email</label>
				<input id="email" name="email" type="email" autocomplete="email" required class={input} />
			</div>
			<button type="submit" class={primary}>Mandarme el enlace</button>
		</form>
	{/if}
	<p class="mt-8 text-center text-sm">
		<a href="/login" class="text-ink-faint underline-offset-2 hover:text-ink hover:underline"
			>Volver a entrar</a
		>
	</p>
</AuthCard>
