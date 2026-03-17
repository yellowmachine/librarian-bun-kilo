<script lang="ts">
	import { page } from '$app/state';
	import { BookOpen, Books, ArrowsLeftRight, SignOut } from 'phosphor-svelte';

	let { children, data } = $props();
	const { user, pendingLoans } = data;

	const currentPath = $derived(page.url.pathname);
	function isActive(path: string) {
		return currentPath.startsWith(path);
	}

	const NAV = [
		{ href: '/library', label: 'Biblioteca', icon: BookOpen },
		{ href: '/groups', label: 'Grupos', icon: Books },
		{ href: '/loans', label: 'Préstamos', icon: ArrowsLeftRight }
	];
</script>

<div class="flex min-h-screen flex-col bg-white">
	<!-- ── Cabecera ──────────────────────────────────────────────────────── -->
	<header class="sticky top-0 z-30 border-b border-neutral-200 bg-white">
		<div class="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
			<!-- Logotipo -->
			<a
				href="/library"
				class="flex items-baseline gap-2 font-serif text-xl font-normal tracking-tight text-neutral-900"
			>
				The Svelte Librarian
				<span class="font-sans text-[10px] font-semibold tracking-widest text-neutral-400 uppercase"
					>Beta</span
				>
			</a>

			<!-- Nav principal -->
			<nav class="flex items-center gap-1">
				{#each NAV as item}
					<a
						href={item.href}
						class="relative flex items-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors
						{isActive(item.href)
							? 'bg-neutral-900 text-white'
							: 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'}"
					>
						<item.icon weight={isActive(item.href) ? 'fill' : 'regular'} size={16} />
						<span class="hidden sm:inline">{item.label}</span>

						{#if item.href === '/loans' && pendingLoans > 0}
							<span
								class="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full
								{isActive(item.href) ? 'bg-white text-neutral-900' : 'bg-neutral-900 text-white'}
								text-[10px] leading-none font-bold"
							>
								{pendingLoans > 9 ? '9+' : pendingLoans}
							</span>
						{/if}
					</a>
				{/each}
			</nav>

			<!-- Usuario + salir -->
			<div class="flex items-center gap-3">
				<span class="hidden text-sm text-neutral-400 sm:block">{user.name}</span>
				<form method="POST" action="/logout">
					<button
						type="submit"
						title="Cerrar sesión"
						class="flex items-center rounded-md p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
					>
						<SignOut size={18} />
					</button>
				</form>
			</div>
		</div>
	</header>

	<!-- ── Contenido ─────────────────────────────────────────────────────── -->
	<main class="mx-auto w-full max-w-4xl flex-1 px-5 py-8">
		{@render children()}
	</main>

	<!-- ── Footer ────────────────────────────────────────────────────────── -->
	<footer class="border-t border-neutral-100 py-4">
		<p class="text-center text-xs text-neutral-400">
			Built with <a
				href="https://kilo.ai"
				target="_blank"
				rel="noopener noreferrer"
				class="underline underline-offset-2 transition-colors hover:text-neutral-600">Kilo</a
			>
			and
			<a
				href="https://www.anthropic.com/claude"
				target="_blank"
				rel="noopener noreferrer"
				class="underline underline-offset-2 transition-colors hover:text-neutral-600"
				>Claude Sonnet 4.6</a
			>
		</p>
	</footer>
</div>
