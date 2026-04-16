<script lang="ts">
	import { enhance } from '$app/forms';
	import { MagnifyingGlass, SpinnerGap } from 'phosphor-svelte';
	import type { UserBookWithDetails } from '$lib/server/books';
	import type { GroupBookResult } from '$lib/server/groups';
	import BookGrid from '$lib/components/BookGrid.svelte';
	import BookCard from '$lib/components/BookCard.svelte';

	let { data, form } = $props();
	const { userBooks } = $derived(data);

	// ── Sección propia ────────────────────────────────────────────────────────
	let search = $state('');
	let activeLetter = $state<string | null>(null);
	let by = $state<'title' | 'author'>('title');

	const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

	const titleLetters = $derived(
		[
			...new Set(
				(userBooks as UserBookWithDetails[])
					.map((b) => b.title[0]?.toUpperCase())
					.filter((l): l is string => /^[A-Z]$/.test(l ?? ''))
			)
		].sort()
	);

	const authorLetters = $derived(
		[
			...new Set(
				(userBooks as UserBookWithDetails[])
					.map((b) => b.authors[0]?.[0]?.toUpperCase())
					.filter((l): l is string => /^[A-Z]$/.test(l ?? ''))
			)
		].sort()
	);

	const activeLetters = $derived(by === 'title' ? titleLetters : authorLetters);

	const filtered = $derived(() => {
		let list = userBooks as UserBookWithDetails[];

		if (activeLetter) {
			if (by === 'title') {
				list = list.filter((b) => b.title[0]?.toUpperCase() === activeLetter);
			} else {
				list = list.filter((b) => b.authors[0]?.[0]?.toUpperCase() === activeLetter);
			}
		}

		if (search.trim()) {
			const q = search.toLowerCase();
			list = list.filter(
				(b) =>
					b.title.toLowerCase().includes(q) ||
					b.authors.some((a: string) => a.toLowerCase().includes(q))
			);
		}

		return list;
	});

	function toggleLetter(l: string) {
		activeLetter = activeLetter === l ? null : l;
	}

	function toggleBy(mode: 'title' | 'author') {
		by = mode;
		activeLetter = null;
	}

	// ── Sección ajenos ────────────────────────────────────────────────────────
	let othersSearching = $state(false);
	const othersResults = $derived(
		(form?.othersResults ?? []) as GroupBookResult[]
	);
	const othersQuery = $derived((form?.othersQuery ?? '') as string);
	const othersSearched = $derived(form !== null && form !== undefined && 'othersResults' in (form ?? {}));
</script>

<div class="space-y-12">
	<!-- ── Mis libros ─────────────────────────────────────────────────────── -->
	<section class="space-y-6">
		<div>
			<h1 class="font-serif text-2xl font-normal text-ink sm:text-3xl">My library</h1>
			<p class="mt-1 text-sm text-ink-faint">
				{(userBooks as UserBookWithDetails[]).length}
				{(userBooks as UserBookWithDetails[]).length === 1 ? 'book' : 'books'}
			</p>
		</div>

		{#if (userBooks as UserBookWithDetails[]).length > 0}
			<!-- Índice alfabético -->
			<div class="space-y-3">
				<div class="flex gap-1 border-b border-paper-border">
					<button
						onclick={() => toggleBy('title')}
						class="border-b-2 pb-2 text-xs font-medium transition-colors
						{by === 'title' ? 'border-ink text-ink' : 'border-transparent text-ink-faint hover:text-ink-muted'}"
					>
						By title
					</button>
					<button
						onclick={() => toggleBy('author')}
						class="ml-4 border-b-2 pb-2 text-xs font-medium transition-colors
						{by === 'author' ? 'border-ink text-ink' : 'border-transparent text-ink-faint hover:text-ink-muted'}"
					>
						By author
					</button>
				</div>

				<div class="flex flex-wrap gap-1">
					<button
						onclick={() => (activeLetter = null)}
						class="flex h-7 w-7 items-center justify-center text-xs transition-colors
						{activeLetter === null ? 'bg-ink text-paper' : 'text-ink-muted hover:text-ink'}"
					>
						All
					</button>
					{#each ALPHABET as l}
						{@const available = activeLetters.includes(l)}
						{@const active = activeLetter === l}
						{#if available}
							<button
								onclick={() => toggleLetter(l)}
								class="flex h-7 w-7 items-center justify-center text-xs font-medium transition-colors
								{active ? 'bg-ink text-paper' : 'text-ink hover:bg-paper-ui'}"
							>
								{l}
							</button>
						{:else}
							<span class="flex h-7 w-7 items-center justify-center text-xs text-ink-faint/30">
								{l}
							</span>
						{/if}
					{/each}
				</div>
			</div>

			<!-- Búsqueda -->
			<div class="relative">
				<MagnifyingGlass
					size={16}
					class="absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
				/>
				<input
					type="search"
					bind:value={search}
					placeholder="Search by title or author..."
					class="w-full border border-paper-border bg-paper-ui py-2 pr-4 pl-9 text-sm text-ink placeholder-ink-faint focus:border-ink focus:bg-paper focus:ring-0"
				/>
			</div>

			{#if filtered().length === 0}
				<p class="py-12 text-center text-sm text-ink-faint">No results.</p>
			{:else}
				<BookGrid
					books={filtered().map((b) => ({
						id: b.userBookId,
						title: b.title,
						authors: b.authors,
						coverUrl: b.coverUrl,
						publishYear: b.publishYear,
						isAvailable: b.isAvailable,
						href: `/library/${b.userBookId}`
					}))}
				/>
			{/if}
		{:else}
			<div class="flex flex-col items-center justify-center py-24 text-center">
				<div class="mb-6 font-serif text-6xl text-ink-faint">·</div>
				<p class="text-sm text-ink-faint">Your library is empty.</p>
				<a href="/library/add" class="mt-4 text-sm text-ink underline underline-offset-2">
					Add your first book
				</a>
			</div>
		{/if}
	</section>

	<!-- ── Libros de otros ────────────────────────────────────────────────── -->
	<section class="space-y-6 border-t border-paper-border pt-8">
		<div>
			<h2 class="font-serif text-xl font-normal text-ink">Books from others</h2>
			<p class="mt-1 text-sm text-ink-faint">
				Search books shared by people in your groups
			</p>
		</div>

		<form
			method="POST"
			action="?/searchOthers"
			class="flex gap-2"
			use:enhance={() => {
				othersSearching = true;
				return async ({ update }) => {
					await update();
					othersSearching = false;
				};
			}}
		>
			<div class="relative flex-1">
				<MagnifyingGlass
					size={16}
					class="absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
				/>
				<input
					type="search"
					name="query"
					value={othersQuery}
					placeholder="Title, author, ISBN, tag or person..."
					class="w-full border border-paper-border bg-paper-ui py-2 pr-4 pl-9 text-sm text-ink placeholder-ink-faint focus:border-ink focus:bg-paper focus:ring-0"
				/>
			</div>
			<button
				type="submit"
				disabled={othersSearching}
				class="border border-ink bg-ink px-4 py-2 text-sm text-paper transition-colors hover:bg-ink/90 disabled:opacity-50"
			>
				{#if othersSearching}
					<SpinnerGap size={16} class="animate-spin" />
				{:else}
					Search
				{/if}
			</button>
		</form>

		{#if othersSearched}
			{#if othersResults.length === 0}
				<p class="text-sm text-ink-faint">No results for "{othersQuery}".</p>
			{:else}
				<p class="text-xs text-ink-faint">
					{othersResults.length} {othersResults.length === 1 ? 'result' : 'results'}
				</p>
				<ul class="divide-y divide-paper-border">
					{#each othersResults as book (book.userBookId)}
						<li class="py-3">
							<div class="flex items-center gap-4">
								<BookCard
									title={book.title}
									authors={book.authors}
									coverUrl={book.coverUrl}
									publishYear={book.publishYear}
									isAvailable={book.isAvailable}
									variant="list"
								/>
							</div>
							<div class="mt-1 flex flex-wrap items-center gap-2 pl-[60px]">
								<span class="text-xs text-ink-faint">{book.ownerName}</span>
								{#if !book.isAvailable}
									<span class="text-xs text-ink-faint">· On loan</span>
								{/if}
								{#each book.tags as tag (tag.id)}
									<span
										class="rounded-full border px-2 py-0.5 text-[10px]"
										style={tag.color
											? `border-color: ${tag.color}44; color: ${tag.color}`
											: 'border-color: #e8e2da; color: #8a8480'}
									>
										{tag.name}
									</span>
								{/each}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</section>
</div>
