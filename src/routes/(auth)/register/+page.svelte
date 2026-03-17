<script lang="ts">
	import { enhance } from '$app/forms';
	let { form } = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-50">
	<div class="w-full max-w-sm space-y-6 rounded-xl bg-white p-8 shadow-sm">
		<div>
			<h1 class="text-2xl font-semibold text-gray-900">Librarian</h1>
			<p class="mt-1 text-sm text-gray-500">Crea tu cuenta</p>
		</div>

		{#if form?.error}
			<p class="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{form.error}</p>
		{/if}

		<form method="POST" use:enhance class="space-y-4">
			<div>
				<label for="name" class="block text-sm font-medium text-gray-700">Nombre</label>
				<input
					id="name"
					name="name"
					type="text"
					required
					autocomplete="name"
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
				/>
			</div>

			<div>
				<label for="email" class="block text-sm font-medium text-gray-700">Email</label>
				<input
					id="email"
					name="email"
					type="email"
					required
					autocomplete="email"
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
				/>
			</div>

			<div>
				<label for="password" class="block text-sm font-medium text-gray-700">Contraseña</label>
				<input
					id="password"
					name="password"
					type="password"
					required
					autocomplete="new-password"
					minlength="8"
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
				/>
			</div>

			<button
				type="submit"
				class="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
			>
				Crear cuenta
			</button>
		</form>

		<p class="text-center text-sm text-gray-500">
			¿Ya tienes cuenta?
			<a href="/login" class="text-blue-600 hover:underline">Inicia sesión</a>
		</p>
	</div>
</div>
