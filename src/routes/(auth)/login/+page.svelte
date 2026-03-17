<script lang="ts">
	import { enhance } from '$app/forms';
	let { form } = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-white px-5">
	<div class="w-full max-w-sm">
		<!-- Marca -->
		<div class="mb-10 text-center">
			<h1 class="font-serif text-4xl font-normal tracking-tight text-neutral-900">librarian</h1>
			<p class="mt-2 text-sm text-neutral-400">Tu biblioteca particular</p>
		</div>

		{#if form?.error}
			<p class="mb-4 border border-neutral-900 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-900">
				{form.error}
			</p>
		{/if}

		<form method="POST" use:enhance class="space-y-4">
			<div>
				<label
					for="email"
					class="block text-xs font-medium tracking-widest text-neutral-500 uppercase"
				>
					Email
				</label>
				<input
					id="email"
					name="email"
					type="email"
					required
					autocomplete="email"
					class="mt-1.5 block w-full border-0 border-b border-neutral-300 bg-transparent px-0 py-2 text-sm text-neutral-900 placeholder-neutral-300 focus:border-neutral-900 focus:ring-0"
					placeholder="tu@email.com"
				/>
			</div>

			<div>
				<label
					for="password"
					class="block text-xs font-medium tracking-widest text-neutral-500 uppercase"
				>
					Contraseña
				</label>
				<input
					id="password"
					name="password"
					type="password"
					required
					autocomplete="current-password"
					class="mt-1.5 block w-full border-0 border-b border-neutral-300 bg-transparent px-0 py-2 text-sm text-neutral-900 placeholder-neutral-300 focus:border-neutral-900 focus:ring-0"
					placeholder="••••••••"
				/>
			</div>

			<div class="pt-2">
				<button
					type="submit"
					class="w-full border border-neutral-900 bg-neutral-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
				>
					Entrar
				</button>
			</div>
		</form>

		<p class="mt-8 text-center text-sm text-neutral-400">
			¿Sin cuenta?
			<a href="/register" class="text-neutral-900 underline underline-offset-2">Regístrate</a>
		</p>
	</div>
</div>
