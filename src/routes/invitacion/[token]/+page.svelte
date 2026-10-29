<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import { input, label, primary, problem, secondary } from '$lib/auth-form';

	let { data, form } = $props();
	const invitation = $derived(data.invitation);
	let busy = $state(false);
</script>

<svelte:head><title>Invitación · Librarian</title></svelte:head>

<AuthCard title="Te invitan a Librarian">
	{#if invitation.hasAccount}
		<p class="text-center text-sm text-ink-muted">
			<span class="text-ink">{invitation.email}</span> ya tiene cuenta.
		</p>
		<a href="/login" class="mt-6 block text-center {primary}">Entrar</a>
	{:else if invitation.status !== 'pending'}
		<p class="text-center text-sm text-ink-muted">
			{#if invitation.status === 'accepted'}
				Esta invitación ya se usó.
			{:else if invitation.status === 'cancelled'}
				Esta invitación se canceló.
			{:else}
				Esta invitación caducó: pide que te la manden otra vez.
			{/if}
		</p>
		<a href="/login" class="mt-6 block text-center {secondary}">Ir a entrar</a>
	{:else}
		<p class="text-center text-sm text-ink-muted">
			{#if invitation.inviterName}<span class="text-ink">{invitation.inviterName}</span> te invita a{:else}Te
				invitan a{/if} organizar tus libros y prestarlos a la gente en la que confías.
		</p>

		<form
			method="POST"
			class="mt-8 space-y-5"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update();
					busy = false;
				};
			}}
		>
			{#if form?.message}
				<p class={problem} role="alert">{form.message}</p>
			{/if}
			<div>
				<span class={label}>Email</span>
				<p class="mt-1.5 border-b border-paper-border py-2 text-sm text-ink">{invitation.email}</p>
			</div>
			<div>
				<label for="name" class={label}>Tu nombre</label>
				<input
					id="name"
					name="name"
					autocomplete="name"
					maxlength="60"
					required
					value={form?.name ?? ''}
					class={input}
				/>
			</div>
			<div>
				<label for="password" class={label}>Contraseña</label>
				<input
					id="password"
					name="password"
					type="password"
					autocomplete="new-password"
					minlength="10"
					required
					class={input}
				/>
				<p class="mt-1 text-xs text-ink-faint">10 caracteres por lo menos.</p>
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
			<button type="submit" class={primary} disabled={busy}>Crear mi cuenta</button>
		</form>

		{#if data.seilide}
			<p class="mt-8 text-center text-xs text-ink-faint">
				¿Tienes cuenta en Seilide? <a
					href="/login"
					class="underline underline-offset-2 hover:text-ink">Entra con ella</a
				> y no necesitas contraseña.
			</p>
		{/if}
	{/if}
</AuthCard>
