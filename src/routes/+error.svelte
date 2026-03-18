<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="flex min-h-screen flex-col items-center justify-center bg-white px-5">
	<div class="w-full max-w-sm text-center">
		<p class="font-serif text-7xl font-normal text-neutral-200">{page.status}</p>
		<h1 class="mt-4 font-serif text-2xl font-normal text-neutral-900">
			{page.status === 404 ? 'Página no encontrada' : 'Algo salió mal'}
		</h1>
		<p class="mt-2 text-sm text-neutral-400">
			{page.error?.message ?? 'Ha ocurrido un error inesperado.'}
		</p>
		<a
			href="/library"
			class="mt-8 inline-block border border-neutral-900 bg-neutral-900 px-6 py-2.5 text-sm text-white hover:bg-neutral-800"
		>
			Volver a la biblioteca
		</a>
	</div>
</div>
