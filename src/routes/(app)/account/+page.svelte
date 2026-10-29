<script lang="ts">
	import { enhance } from '$app/forms';
	import { input, label, primary, problem } from '$lib/auth-form';

	let { data, form } = $props();

	const STATUS = {
		pending: 'Pendiente',
		accepted: 'Aceptada',
		expired: 'Caducada',
		cancelled: 'Cancelada'
	} as const;

	let copied = $state<string | null>(null);
	async function copy(link: string) {
		await navigator.clipboard.writeText(link);
		copied = link;
		setTimeout(() => (copied = null), 2000);
	}

	const date = (d: Date) => d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
</script>

<svelte:head><title>Tu cuenta · Librarian</title></svelte:head>

<div class="mx-auto max-w-md space-y-12">
	<h1 class="font-serif text-2xl font-normal text-ink">Tu cuenta</h1>

	<!-- ── Invitar ─────────────────────────────────────────────────────── -->
	<section class="space-y-5">
		<div>
			<h2 class="text-sm font-medium text-ink">Invitar a alguien</h2>
			<p class="mt-1 text-sm text-ink-muted">
				Librarian funciona por invitación. Le llega un enlace por correo que vale 7 días.
			</p>
		</div>

		{#if form?.invite?.message}
			<p class={problem} role="alert">{form.invite.message}</p>
		{:else if form?.invite?.link}
			<p class={problem}>
				{#if form.invite.sent}
					Invitación mandada a {form.invite.email}.
				{:else}
					El correo a {form.invite.email} no salió. Pásale este enlace:
					<span class="mt-1 block break-all text-ink-muted">{form.invite.link}</span>
				{/if}
			</p>
		{/if}

		<form method="POST" action="?/invite" use:enhance class="flex items-end gap-3">
			<div class="flex-1">
				<label for="email" class={label}>Email</label>
				<input id="email" name="email" type="email" required class={input} />
			</div>
			<button
				type="submit"
				class="border border-ink bg-ink px-4 py-2 text-sm text-paper hover:bg-ink/90"
				>Invitar</button
			>
		</form>

		{#if data.invitations.length > 0}
			<ul class="divide-y divide-paper-border border-y border-paper-border">
				{#each data.invitations as invitation (invitation.id)}
					<li class="flex items-center gap-3 py-3 text-sm">
						<div class="min-w-0 flex-1">
							<p class="truncate text-ink">{invitation.email}</p>
							<p class="text-xs text-ink-faint">
								{STATUS[invitation.status]} · {date(invitation.createdAt)}
							</p>
						</div>
						{#if invitation.link}
							<button
								type="button"
								onclick={() => copy(invitation.link!)}
								class="text-xs text-ink-faint hover:text-ink"
							>
								{copied === invitation.link ? 'Copiado' : 'Copiar enlace'}
							</button>
							<form method="POST" action="?/cancel" use:enhance>
								<input type="hidden" name="id" value={invitation.id} />
								<button type="submit" class="text-xs text-ink-faint hover:text-ink">Cancelar</button
								>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- ── OpenRouter ─────────────────────────────────────────────────── -->
	<section class="space-y-5">
		<div>
			<h2 class="text-sm font-medium text-ink">Clave de OpenRouter</h2>
			<p class="mt-1 text-sm text-ink-muted">
				Con tu clave, Librarian escanea estanterías, sugiere etiquetas y busca portadas con IA. Lo
				que gastes lo paga tu cuenta de
				<a
					href="https://openrouter.ai/keys"
					target="_blank"
					rel="noopener noreferrer"
					class="underline underline-offset-2 hover:text-ink">OpenRouter</a
				>. Se guarda cifrada.
			</p>
		</div>

		{#if form?.key?.message}
			<p class={problem} role="alert">{form.key.message}</p>
		{/if}

		{#if data.hasKey}
			<div class="flex items-center justify-between border-y border-paper-border py-3 text-sm">
				<span class="text-ink">Clave conectada</span>
				<form method="POST" action="?/removeKey" use:enhance>
					<button type="submit" class="text-xs text-ink-faint hover:text-ink">Quitar</button>
				</form>
			</div>
		{/if}

		<form method="POST" action="?/saveKey" use:enhance class="space-y-5">
			<div>
				<label for="apiKey" class={label}>{data.hasKey ? 'Cambiar la clave' : 'Tu clave'}</label>
				<input
					id="apiKey"
					name="apiKey"
					type="password"
					autocomplete="off"
					placeholder="sk-or-…"
					required
					class={input}
				/>
			</div>
			<button type="submit" class={primary}>Guardar clave</button>
		</form>
	</section>
</div>
