<script lang="ts">
	import { enhance } from '$app/forms';
	let { data } = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-white px-5">
	<div class="w-full max-w-sm text-center">
		<h1 class="font-serif text-4xl font-normal tracking-tight text-neutral-900">librarian</h1>
		<p class="mt-2 text-sm text-neutral-400">Tu biblioteca particular</p>

		<div class="mt-10">
			<p class="text-sm font-medium text-neutral-900">Sin acceso a Librarian</p>
			<p class="mt-3 text-sm text-neutral-500">
				{#if data.user}
					Tu cuenta (<span class="text-neutral-700">{data.user.email}</span>) está registrada en
					Scholio pero no tiene acceso a Librarian todavía.
				{:else}
					Tu cuenta no tiene acceso a Librarian todavía.
				{/if}
			</p>
			<p class="mt-2 text-sm text-neutral-500">
				Si quieres acceder, regístrate directamente en Librarian con una nueva cuenta.
			</p>
		</div>

		<div class="mt-8 flex flex-col gap-3">
			<a
				href="/register"
				class="block w-full rounded-none border border-neutral-900 bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
			>
				Crear cuenta en Librarian
			</a>

			<form method="POST" action="?/logout" use:enhance>
				<button
					type="submit"
					class="w-full px-4 py-2.5 text-sm text-neutral-500 hover:text-neutral-900"
				>
					Cerrar sesión
				</button>
			</form>
		</div>
	</div>
</div>
