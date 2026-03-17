<script lang="ts">
	import { enhance } from '$app/forms';
	let { form } = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-white px-5">
	<div class="w-full max-w-sm">
		<div class="mb-10 text-center">
			<h1 class="font-serif text-4xl font-normal tracking-tight text-neutral-900">librarian</h1>
			<p class="mt-2 text-sm text-neutral-400">Crea tu cuenta</p>
		</div>

		{#if form?.error}
			<p class="mb-4 border border-neutral-900 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-900">
				{form.error}
			</p>
		{/if}

		<form method="POST" use:enhance class="space-y-4">
			<div>
				<label
					for="name"
					class="block text-xs font-medium tracking-widest text-neutral-500 uppercase">Nombre</label
				>
				<input
					id="name"
					name="name"
					type="text"
					required
					autocomplete="name"
					placeholder="Tu nombre"
					class="mt-1.5 block w-full border-0 border-b border-neutral-300 bg-transparent px-0 py-2 text-sm text-neutral-900 placeholder-neutral-300 focus:border-neutral-900 focus:ring-0"
				/>
			</div>
			<div>
				<label
					for="email"
					class="block text-xs font-medium tracking-widest text-neutral-500 uppercase">Email</label
				>
				<input
					id="email"
					name="email"
					type="email"
					required
					autocomplete="email"
					placeholder="tu@email.com"
					class="mt-1.5 block w-full border-0 border-b border-neutral-300 bg-transparent px-0 py-2 text-sm text-neutral-900 placeholder-neutral-300 focus:border-neutral-900 focus:ring-0"
				/>
			</div>
			<div>
				<label
					for="password"
					class="block text-xs font-medium tracking-widest text-neutral-500 uppercase"
					>Contraseña</label
				>
				<input
					id="password"
					name="password"
					type="password"
					required
					autocomplete="new-password"
					placeholder="8 caracteres mínimo"
					minlength="8"
					class="mt-1.5 block w-full border-0 border-b border-neutral-300 bg-transparent px-0 py-2 text-sm text-neutral-900 placeholder-neutral-300 focus:border-neutral-900 focus:ring-0"
				/>
			</div>

			<div class="pt-2">
				<button
					type="submit"
					class="w-full border border-neutral-900 bg-neutral-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
				>
					Crear cuenta
				</button>
			</div>
		</form>

		<p class="mt-8 text-center text-sm text-neutral-400">
			¿Ya tienes cuenta?
			<a href="/login" class="text-neutral-900 underline underline-offset-2">Inicia sesión</a>
		</p>
	</div>
</div>
