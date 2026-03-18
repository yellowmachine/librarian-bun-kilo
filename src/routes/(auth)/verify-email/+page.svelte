<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();

	let email = $state('');
	let showResendForm = $state(false);
</script>

<div class="flex min-h-screen items-center justify-center bg-white px-5">
	<div class="w-full max-w-sm text-center">
		<h1 class="font-serif text-4xl font-normal tracking-tight text-neutral-900">librarian</h1>
		<p class="mt-2 text-sm text-neutral-400">Confirma tu email</p>

		<div class="mt-10 border border-neutral-200 px-6 py-8">
			<p class="text-sm leading-relaxed text-neutral-600">
				Te hemos enviado un enlace de confirmación. Revisa tu bandeja de entrada y haz clic en el
				enlace para activar tu cuenta.
			</p>
			<p class="mt-4 text-xs text-neutral-400">
				El enlace expira en 24 horas. Si no ves el email, revisa la carpeta de spam.
			</p>
		</div>

		<!-- Reenviar email -->
		<div class="mt-6">
			{#if form?.resent}
				<p class="text-sm text-neutral-500">
					Si el email está registrado, recibirás un nuevo enlace en breve.
				</p>
			{:else if showResendForm}
				<form method="POST" action="?/resend" use:enhance class="space-y-3">
					{#if form?.error}
						<p class="text-xs text-red-500">{form.error}</p>
					{/if}
					<input
						type="email"
						name="email"
						bind:value={email}
						placeholder="Tu email"
						required
						class="w-full border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-900 focus:ring-0"
					/>
					<button
						type="submit"
						class="w-full border border-neutral-900 bg-neutral-900 py-2 text-sm text-white hover:bg-neutral-800"
					>
						Reenviar enlace
					</button>
					<button
						type="button"
						onclick={() => (showResendForm = false)}
						class="block w-full text-xs text-neutral-400 hover:text-neutral-600"
					>
						Cancelar
					</button>
				</form>
			{:else}
				<button
					type="button"
					onclick={() => (showResendForm = true)}
					class="text-sm text-neutral-400 underline underline-offset-2 hover:text-neutral-700"
				>
					¿No recibiste el email? Reenviar
				</button>
			{/if}
		</div>

		<p class="mt-8 text-center text-sm text-neutral-400">
			¿Ya confirmaste?
			<a href="/login" class="text-neutral-900 underline underline-offset-2">Inicia sesión</a>
		</p>
	</div>
</div>
