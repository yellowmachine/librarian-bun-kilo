<script lang="ts">
	let { children, data } = $props();
	const { user } = data;
</script>

<!-- Shell principal de la app: nav + contenido -->
<div class="flex min-h-screen flex-col">
	<header class="border-b border-gray-200 bg-white">
		<nav class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
			<a href="/library" class="text-lg font-semibold text-gray-900">Librarian</a>

			<div class="flex items-center gap-4">
				<a href="/library" class="text-sm text-gray-600 hover:text-gray-900">Mi biblioteca</a>
				<a href="/groups" class="text-sm text-gray-600 hover:text-gray-900">Grupos</a>
				<a href="/loans" class="text-sm text-gray-600 hover:text-gray-900">Préstamos</a>
				<span class="text-sm text-gray-500">{user.name}</span>
				<form method="POST" action="/logout">
					<button type="submit" class="text-sm text-gray-500 hover:text-gray-900">Salir</button>
				</form>
			</div>
		</nav>
	</header>

	<main class="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
		{@render children()}
	</main>
</div>
