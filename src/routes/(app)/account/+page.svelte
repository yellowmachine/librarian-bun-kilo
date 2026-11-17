<script lang="ts">
	import { enhance } from '$app/forms';
	import { input, label, primary, problem } from '$lib/auth-form';
	import { formatUsd } from '$lib/aiUsageLabels';
	import type { Contrast } from '$lib/contrast';

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

	const CONTRAST_LABELS: Record<Contrast, { label: string; hint: string }> = {
		system: { label: 'Como el sistema', hint: 'Alto si tu dispositivo pide más contraste' },
		normal: { label: 'Normal', hint: 'Los colores de siempre' },
		more: { label: 'Alto', hint: 'Texto y bordes más oscuros, fondo blanco' }
	};

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
			<button type="submit" class="border btn-primary px-4 py-2 text-sm">Invitar</button>
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

	<!-- ── Contraste ──────────────────────────────────────────────────── -->
	<section class="space-y-5">
		<div>
			<h2 class="text-sm font-medium text-ink">Contraste</h2>
			<p class="mt-1 text-sm text-ink-muted">Se guarda en este dispositivo.</p>
		</div>

		<form
			method="POST"
			action="?/setContrast"
			use:enhance={({ formData }) => {
				// Se aplica ya, sin esperar a recargar: el atributo de <html> lo pone el servidor
				document.documentElement.dataset.contrast = String(formData.get('contrast'));
				return async ({ update }) => update({ reset: false });
			}}
		>
			<fieldset class="space-y-2">
				<legend class="sr-only">Contraste</legend>
				{#each Object.entries(CONTRAST_LABELS) as [value, option] (value)}
					<label
						class="flex cursor-pointer items-start gap-3 border px-4 py-3 text-sm transition-colors
						{data.contrast === value
							? 'border-brown-600 bg-paper'
							: 'border-paper-border hover:border-ink-faint'}"
					>
						<input
							type="radio"
							name="contrast"
							{value}
							checked={data.contrast === value}
							onchange={(e) => e.currentTarget.form?.requestSubmit()}
							class="mt-0.5 border-field text-brown-700 focus:ring-brown-600"
						/>
						<span>
							<span class="block text-ink">{option.label}</span>
							<span class="block text-xs text-ink-faint">{option.hint}</span>
						</span>
					</label>
				{/each}
			</fieldset>
			<noscript
				><button type="submit" class="mt-3 border btn-secondary px-4 py-2 text-sm">Guardar</button
				></noscript
			>
		</form>
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
					class="link-action">OpenRouter</a
				>. Se guarda cifrada.
			</p>
		</div>

		<a
			href="/account/ai-usage"
			class="flex items-center justify-between border border-paper-border px-4 py-3 text-sm transition-colors hover:border-ink-faint"
		>
			<span class="text-ink-muted">
				Consumo de IA este mes:
				<strong class="font-medium text-ink">{formatUsd(data.monthCostUsd)}</strong>
			</span>
			<span class="text-xs text-brown-600">Ver detalle →</span>
		</a>

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
