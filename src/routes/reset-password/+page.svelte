<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import { input, label, primary, problem } from '$lib/auth-form';

	let { data, form } = $props();
</script>

<svelte:head><title>Contraseña nueva · Librarian</title></svelte:head>

<AuthCard title="Elige una contraseña nueva">
	{#if data.invalid || !data.token}
		<p class="text-center text-sm text-ink-muted">
			Este enlace ya no vale: caducó o ya se usó.
			<a href="/forgot-password" class="text-ink underline underline-offset-2">Pide otro</a>.
		</p>
	{:else}
		<form method="POST" use:enhance class="space-y-5">
			{#if form?.message}
				<p class={problem} role="alert">{form.message}</p>
			{/if}
			<div>
				<label for="password" class={label}>Contraseña nueva</label>
				<input
					id="password"
					name="password"
					type="password"
					autocomplete="new-password"
					minlength="10"
					required
					class={input}
				/>
			</div>
			<div>
				<label for="confirm" class={label}>Otra vez</label>
				<input
					id="confirm"
					name="confirm"
					type="password"
					autocomplete="new-password"
					minlength="10"
					required
					class={input}
				/>
			</div>
			<button type="submit" class={primary}>Guardar contraseña</button>
		</form>
	{/if}
</AuthCard>
