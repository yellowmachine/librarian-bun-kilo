<script lang="ts">
	import { enhance } from '$app/forms';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { MagnifyingGlass, Tag, BookOpen, Export, Plus, CaretDown } from 'phosphor-svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import type { UserBookWithDetails } from '$lib/server/books';
	import type { GroupBookResult } from '$lib/server/groups';
	import BookGrid from '$lib/components/BookGrid.svelte';

	let exportOpen = $state(false);
	let activeTab = $state<'mine' | 'others' | 'contacts'>('mine');

	let { data, form } = $props();
	const { userBooks, contacts, sharedTagsForOthers } = $derived(data);

	function normalize(s: string) {
		return s
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase();
	}

	// ── Sección propia ────────────────────────────────────────────────────────
	let search = $state('');
	let activeLetter = $state<string | null>(null);
	let by = $state<'title' | 'author'>('title');
	let activeMineTagIds = new SvelteSet<string>();

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

	const mineTags = $derived(() => {
		const map = new SvelteMap<string, { id: string; name: string; color: string | null }>();
		for (const book of userBooks as UserBookWithDetails[]) {
			for (const tag of book.tags) {
				if (!map.has(tag.id)) map.set(tag.id, tag);
			}
		}
		return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
	});

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
			const q = normalize(search);
			list = list.filter(
				(b) =>
					normalize(b.title).includes(q) || b.authors.some((a: string) => normalize(a).includes(q))
			);
		}

		if (activeMineTagIds.size > 0) {
			list = list.filter((b) => b.tags.some((t) => activeMineTagIds.has(t.id)));
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

	function toggleMineTag(id: string) {
		const next = new SvelteSet(activeMineTagIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		activeMineTagIds = next;
	}

	// ── Sección ajenos ────────────────────────────────────────────────────────
	let othersSearching = $state(false);
	let activeOtherTagIds = new SvelteSet<string>();
	const othersResults = $derived((form?.othersResults ?? []) as GroupBookResult[]);
	const othersQuery = $derived((form?.othersQuery ?? '') as string);
	const othersTagIds = $derived((form?.othersTagIds ?? []) as string[]);
	const othersSearched = $derived(
		form !== null && form !== undefined && 'othersResults' in (form ?? {})
	);

	$effect(() => {
		if (othersSearched) {
			activeTab = 'others';
			activeOtherTagIds = new SvelteSet(othersTagIds);
		}
	});

	function toggleOtherTag(id: string) {
		const next = new SvelteSet(activeOtherTagIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		activeOtherTagIds = next;
	}

	// ── Sección contactos ─────────────────────────────────────────────────────
	let contactsLoading = $state(false);
	let contactSearch = $state('');
	let activeContactTagIds = new SvelteSet<string>();
	const contactBooks = $derived((form?.contactBooks ?? []) as UserBookWithDetails[]);
	const selectedContactId = $derived((form?.contactId ?? '') as string);
	const contactsFetched = $derived(
		form !== null && form !== undefined && 'contactBooks' in (form ?? {})
	);

	const contactTags = $derived(() => {
		const map = new SvelteMap<string, { id: string; name: string; color: string | null }>();
		for (const book of contactBooks) {
			for (const tag of book.tags) {
				if (!map.has(tag.id)) map.set(tag.id, tag);
			}
		}
		return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
	});

	const filteredContactBooks = $derived(() => {
		let list = contactBooks;

		if (contactSearch.trim()) {
			const q = normalize(contactSearch);
			list = list.filter(
				(b) =>
					normalize(b.title).includes(q) || b.authors.some((a: string) => normalize(a).includes(q))
			);
		}

		if (activeContactTagIds.size > 0) {
			list = list.filter((b) => b.tags.some((t) => activeContactTagIds.has(t.id)));
		}

		return list;
	});

	$effect(() => {
		if (contactsFetched) {
			activeTab = 'contacts';
			activeContactTagIds = new SvelteSet();
		}
	});

	function toggleContactTag(id: string) {
		const next = new SvelteSet(activeContactTagIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		activeContactTagIds = next;
	}
</script>

<div class="space-y-6">
	<!-- ── Cabecera + acciones ───────────────────────────────────────────── -->
	<div class="flex items-end justify-between gap-4">
		<div>
			<h1 class="font-serif text-2xl font-normal text-ink sm:text-3xl">Library</h1>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<a
				href="/libraries"
				class="flex items-center gap-1.5 border border-paper-border px-3 py-2 text-sm text-ink-muted transition-colors hover:border-ink-faint hover:text-ink"
			>
				<BookOpen size={15} />
				<span class="hidden sm:inline">Libraries</span>
			</a>

			<a
				href="/tags"
				class="flex items-center gap-1.5 border border-paper-border px-3 py-2 text-sm text-ink-muted transition-colors hover:border-ink-faint hover:text-ink"
			>
				<Tag size={15} />
				<span class="hidden sm:inline">Tags</span>
			</a>

			<!-- Export dropdown -->
			<div class="relative">
				<button
					onclick={() => (exportOpen = !exportOpen)}
					class="flex items-center gap-1.5 border border-paper-border px-3 py-2 text-sm text-ink-muted transition-colors hover:border-ink-faint hover:text-ink"
				>
					<Export size={15} />
					<span class="hidden sm:inline">Export</span>
					<CaretDown size={11} class="transition-transform {exportOpen ? 'rotate-180' : ''}" />
				</button>
				{#if exportOpen}
					<div
						class="absolute top-full right-0 z-20 mt-1 min-w-36 border border-paper-border bg-paper shadow-sm"
					>
						<a
							href="/api/export?format=yaml"
							download="library.yaml"
							onclick={() => (exportOpen = false)}
							class="flex items-center gap-2 px-4 py-2.5 text-sm text-ink-muted hover:bg-paper-ui"
						>
							YAML
							<span class="ml-auto text-xs text-ink-faint">.yaml</span>
						</a>
						<a
							href="/api/export?format=bibtex"
							download="library.bib"
							onclick={() => (exportOpen = false)}
							class="flex items-center gap-2 px-4 py-2.5 text-sm text-ink-muted hover:bg-paper-ui"
						>
							BibTeX
							<span class="ml-auto text-xs text-ink-faint">.bib</span>
						</a>
					</div>
				{/if}
			</div>

			<a
				href="/library/add"
				class="flex items-center gap-1.5 border border-ink bg-ink px-3 py-2 text-sm text-paper transition-colors hover:bg-ink/90"
			>
				<Plus size={15} weight="bold" />
				<span class="hidden sm:inline">Add</span>
			</a>
		</div>
	</div>

	<!-- ── Tabs ──────────────────────────────────────────────────────────── -->
	<div class="flex border-b border-paper-border">
		<button
			onclick={() => (activeTab = 'mine')}
			class="flex items-center gap-2 border-b-2 pr-6 pb-3 text-sm transition-colors
			{activeTab === 'mine'
				? 'border-ink font-medium text-ink'
				: 'border-transparent text-ink-faint hover:text-ink-muted'}"
		>
			My books
			<span class="text-xs {activeTab === 'mine' ? 'text-ink-muted' : 'text-ink-faint'}">
				{(userBooks as UserBookWithDetails[]).length}
			</span>
		</button>
		<button
			onclick={() => (activeTab = 'others')}
			class="flex items-center gap-2 border-b-2 pr-6 pb-3 text-sm transition-colors
			{activeTab === 'others'
				? 'border-ink font-medium text-ink'
				: 'border-transparent text-ink-faint hover:text-ink-muted'}"
		>
			From others
		</button>
		{#if contacts.length > 0}
			<button
				onclick={() => (activeTab = 'contacts')}
				class="flex items-center gap-2 border-b-2 pr-6 pb-3 text-sm transition-colors
				{activeTab === 'contacts'
					? 'border-ink font-medium text-ink'
					: 'border-transparent text-ink-faint hover:text-ink-muted'}"
			>
				Contacts
			</button>
		{/if}
	</div>

	<!-- ── Mis libros ────────────────────────────────────────────────────── -->
	{#if activeTab === 'mine'}
		{#if (userBooks as UserBookWithDetails[]).length > 0}
			<!-- Filtro de tags -->
			{#if mineTags().length > 0}
				<div class="flex flex-wrap gap-1.5">
					{#each mineTags() as tag (tag.id)}
						{@const active = activeMineTagIds.has(tag.id)}
						<button
							onclick={() => toggleMineTag(tag.id)}
							class="rounded-full border px-2.5 py-0.5 text-xs transition-colors"
							style={active
								? tag.color
									? `background-color: ${tag.color}22; border-color: ${tag.color}; color: ${tag.color}`
									: 'background-color: #e8e2da; border-color: #8a8480; color: #3a3430'
								: tag.color
									? `border-color: ${tag.color}44; color: ${tag.color}88`
									: 'border-color: #e8e2da; color: #b0aaa4'}
						>
							{tag.name}
						</button>
					{/each}
					{#if activeMineTagIds.size > 0}
						<button
							onclick={() => (activeMineTagIds = new SvelteSet())}
							class="px-2.5 py-0.5 text-xs text-ink-faint hover:text-ink-muted"
						>
							Clear
						</button>
					{/if}
				</div>
			{/if}

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
						{by === 'author'
							? 'border-ink text-ink'
							: 'border-transparent text-ink-faint hover:text-ink-muted'}"
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
					{#each ALPHABET as l (l)}
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

		<!-- ── Libros de otros ────────────────────────────────────────────────── -->
	{:else if activeTab === 'others'}
		<!-- Filtro de tags compartidos -->
		{#if sharedTagsForOthers.length > 0}
			<div class="flex flex-wrap gap-1.5">
				{#each sharedTagsForOthers as tag (tag.id)}
					{@const active = activeOtherTagIds.has(tag.id)}
					<button
						onclick={() => toggleOtherTag(tag.id)}
						class="rounded-full border px-2.5 py-0.5 text-xs transition-colors"
						style={active
							? tag.color
								? `background-color: ${tag.color}22; border-color: ${tag.color}; color: ${tag.color}`
								: 'background-color: #e8e2da; border-color: #8a8480; color: #3a3430'
							: tag.color
								? `border-color: ${tag.color}44; color: ${tag.color}88`
								: 'border-color: #e8e2da; color: #b0aaa4'}
					>
						{tag.name}
					</button>
				{/each}
				{#if activeOtherTagIds.size > 0}
					<button
						onclick={() => (activeOtherTagIds = new SvelteSet())}
						class="px-2.5 py-0.5 text-xs text-ink-faint hover:text-ink-muted"
					>
						Clear
					</button>
				{/if}
			</div>
		{/if}

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
			{#each [...activeOtherTagIds] as tagId (tagId)}
				<input type="hidden" name="tagIds" value={tagId} />
			{/each}
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
					<Spinner size="sm" />
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
					{othersResults.length}
					{othersResults.length === 1 ? 'result' : 'results'}
				</p>
				<BookGrid
					books={othersResults.map((b) => ({
						id: b.userBookId,
						title: b.title,
						authors: b.authors,
						coverUrl: b.coverUrl,
						isAvailable: b.isAvailable,
						href: `/library/${b.userBookId}`
					}))}
				/>
			{/if}
		{:else}
			<p class="text-sm text-ink-faint">Search books shared by people in your groups.</p>
		{/if}

		<!-- ── Contactos ─────────────────────────────────────────────────────── -->
	{:else}
		<form
			method="POST"
			action="?/contactBooks"
			use:enhance={() => {
				contactsLoading = true;
				return async ({ update }) => {
					await update();
					contactsLoading = false;
				};
			}}
		>
			<select
				name="contactId"
				onchange={(e) => (e.currentTarget as HTMLSelectElement).form?.requestSubmit()}
				class="w-full border border-paper-border bg-paper-ui px-3 py-2 text-sm text-ink focus:border-ink focus:bg-paper focus:ring-0"
			>
				<option value="">Select a contact…</option>
				{#each contacts as c (c.userId)}
					<option value={c.userId} selected={c.userId === selectedContactId}>{c.name}</option>
				{/each}
			</select>
		</form>

		{#if contactsLoading}
			<div class="flex justify-center py-12">
				<Spinner size="md" />
			</div>
		{:else if contactsFetched}
			{#if contactBooks.length === 0}
				<p class="text-sm text-ink-faint">No shared books from this contact.</p>
			{:else}
				<!-- Filtro de tags del contacto -->
				{#if contactTags().length > 0}
					<div class="flex flex-wrap gap-1.5">
						{#each contactTags() as tag (tag.id)}
							{@const active = activeContactTagIds.has(tag.id)}
							<button
								onclick={() => toggleContactTag(tag.id)}
								class="rounded-full border px-2.5 py-0.5 text-xs transition-colors"
								style={active
									? tag.color
										? `background-color: ${tag.color}22; border-color: ${tag.color}; color: ${tag.color}`
										: 'background-color: #e8e2da; border-color: #8a8480; color: #3a3430'
									: tag.color
										? `border-color: ${tag.color}44; color: ${tag.color}88`
										: 'border-color: #e8e2da; color: #b0aaa4'}
							>
								{tag.name}
							</button>
						{/each}
						{#if activeContactTagIds.size > 0}
							<button
								onclick={() => (activeContactTagIds = new SvelteSet())}
								class="px-2.5 py-0.5 text-xs text-ink-faint hover:text-ink-muted"
							>
								Clear
							</button>
						{/if}
					</div>
				{/if}

				<div class="relative">
					<MagnifyingGlass
						size={16}
						class="absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
					/>
					<input
						type="search"
						bind:value={contactSearch}
						placeholder="Search by title or author..."
						class="w-full border border-paper-border bg-paper-ui py-2 pr-4 pl-9 text-sm text-ink placeholder-ink-faint focus:border-ink focus:bg-paper focus:ring-0"
					/>
				</div>
				{#if filteredContactBooks().length === 0}
					<p class="py-12 text-center text-sm text-ink-faint">No results.</p>
				{:else}
					<p class="text-xs text-ink-faint">
						{filteredContactBooks().length}
						{filteredContactBooks().length === 1 ? 'book' : 'books'}
					</p>
					<BookGrid
						books={filteredContactBooks().map((b) => ({
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
			{/if}
		{:else}
			<p class="text-sm text-ink-faint">Select a contact to browse their library.</p>
		{/if}
	{/if}
</div>
