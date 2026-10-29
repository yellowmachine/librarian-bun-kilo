<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import { input, label, primary, problem, secondary } from '$lib/auth-form';

	let { data, form } = $props();
	let busy = $state(false);

	const nextQuery = $derived(
		data.next === '/library' ? '' : `&next=${encodeURIComponent(data.next)}`
	);
</script>

<svelte:head><title>Entrar · Librarian</title></svelte:head>

<AuthCard title="Entrar">
	<div class="space-y-6">
		{#if data.passwordChanged}
			<p class={problem}>Contraseña cambiada. Ya puedes entrar con ella.</p>
		{/if}
		{#if data.seilideProblem}
			<p class={problem} role="alert">{data.seilideProblem}</p>
		{/if}
		{#if form?.message}
			<p class={problem} role="alert">{form.message}</p>
		{/if}

		{#if data.seilide}
			<form method="POST" action="?/seilide{nextQuery}">
				<button type="submit" class={secondary}>Entrar con Seilide</button>
			</form>
			<div class="flex items-center gap-3 text-xs text-ink-faint">
				<span class="h-px flex-1 bg-paper-border"></span>
				o con tu contraseña
				<span class="h-px flex-1 bg-paper-border"></span>
			</div>
		{/if}

		<form
			method="POST"
			action="?/password{nextQuery}"
			class="space-y-5"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update();
					busy = false;
				};
			}}
		>
			<div>
				<label for="email" class={label}>Email</label>
				<input
					id="email"
					name="email"
					type="email"
					autocomplete="email"
					required
					value={form?.email ?? ''}
					class={input}
				/>
			</div>
			<div>
				<label for="password" class={label}>Contraseña</label>
				<input
					id="password"
					name="password"
					type="password"
					autocomplete="current-password"
					required
					class={input}
				/>
			</div>
			<button type="submit" class={primary} disabled={busy}>Entrar</button>
		</form>

		<p class="text-center text-sm">
			<a
				href="/forgot-password"
				class="text-ink-faint underline-offset-2 hover:text-ink hover:underline"
				>He olvidado mi contraseña</a
			>
		</p>
		<p class="text-center text-xs text-ink-faint">
			Librarian funciona por invitación: pídesela a alguien que ya esté dentro.
		</p>
	</div>
</AuthCard>
