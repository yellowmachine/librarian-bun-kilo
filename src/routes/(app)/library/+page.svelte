<script lang="ts">
	import { untrack } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { navigating } from '$app/state';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import {
		MagnifyingGlass,
		Tag,
		BookOpen,
		Export,
		Plus,
		CaretDown,
		CheckSquare
	} from 'phosphor-svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import type { UserBookWithDetails } from '$lib/server/books';
	import BookGrid from '$lib/components/BookGrid.svelte';
	import TagChips from '$lib/components/TagChips.svelte';
	import ContactList from '$lib/components/ContactList.svelte';
	import GroupList from '$lib/components/GroupList.svelte';
	import type { LibraryTab } from './+page.server';

	let exportOpen = $state(false);

	let { data } = $props();
	const {
		tab,
		userBooks,
		contacts,
		groups,
		groupItemCounts,
		sharedTagsForOthers,
		userLibraries,
		libraryId,
		selectedContact,
		contactBooks,
		selectedGroup,
		groupBooks,
		search: othersSearch
	} = $derived(data);

	function tabHref(id: LibraryTab) {
		if (id === 'mine') return libraryId ? `/library?libraryId=${libraryId}` : '/library';
		return `/library?tab=${id}`;
	}

	const currentLibraryName = $derived(
		libraryId ? (userLibraries.find((lib) => lib.id === libraryId)?.name ?? 'Library') : 'Library'
	);

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

	// "Copy 2 of 3" — agrupa por bookId (catálogo) o por título+autores normalizados
	// (entrada manual), y solo etiqueta los grupos con más de una copia.
	const copyLabelByUserBookId = $derived.by(() => {
		const groups = new SvelteMap<string, UserBookWithDetails[]>();
		for (const b of userBooks as UserBookWithDetails[]) {
			const key =
				b.bookId ?? `manual:${normalize(b.title)}:${b.authors.map(normalize).sort().join('|')}`;
			const group = groups.get(key) ?? [];
			group.push(b);
			groups.set(key, group);
		}

		const labels = new SvelteMap<string, string>();
		for (const group of groups.values()) {
			if (group.length < 2) continue;
			const sorted = [...group].sort(
				(a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime()
			);
			sorted.forEach((b, i) => labels.set(b.userBookId, `Copy ${i + 1} of ${sorted.length}`));
		}
		return labels;
	});

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
					normalize(b.title).includes(q) ||
					b.authors.some((a: string) => normalize(a).includes(q)) ||
					(b.alternateTitle && normalize(b.alternateTitle).includes(q))
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
		if (activeMineTagIds.has(id)) activeMineTagIds.delete(id);
		else activeMineTagIds.add(id);
	}

	// ── Selección en bloque + mover a otra biblioteca ────────────────────────────
	let selectionMode = $state(false);
	let selectedIds = new SvelteSet<string>();
	let moveTargetLibraryId = $state('');
	let moving = $state(false);
	let moveError = $state('');

	function exitSelectionMode() {
		selectionMode = false;
		selectedIds.clear();
		moveTargetLibraryId = '';
		moveError = '';
	}

	$effect(() => {
		if (tab !== 'mine') untrack(exitSelectionMode);
	});

	function toggleSelect(userBookId: string) {
		if (selectedIds.has(userBookId)) selectedIds.delete(userBookId);
		else selectedIds.add(userBookId);
	}

	const allFilteredSelected = $derived(
		filtered().length > 0 && filtered().every((b) => selectedIds.has(b.userBookId))
	);

	function toggleSelectAll() {
		if (allFilteredSelected) {
			selectedIds.clear();
		} else {
			for (const b of filtered()) selectedIds.add(b.userBookId);
		}
	}

	async function moveSelected() {
		if (selectedIds.size === 0 || !moveTargetLibraryId) return;
		moving = true;
		moveError = '';
		try {
			const response = await fetch('/api/books/library', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					userBookIds: [...selectedIds],
					libraryId: moveTargetLibraryId
				})
			});
			if (!response.ok) {
				const body = await response.json().catch(() => null);
				throw new Error(body?.message ?? 'Error moving books.');
			}
			await invalidateAll();
			exitSelectionMode();
		} catch (e) {
			moveError = e instanceof Error ? e.message : 'Error moving books.';
		} finally {
			moving = false;
		}
	}

	// ── Contactos y grupos: filtro en cliente sobre los libros cargados ─────────
	let browseSearch = $state('');
	let activeBrowseTagIds = new SvelteSet<string>();

	type BrowseBook = {
		userBookId: string;
		title: string;
		authors: string[];
		alternateTitle: string | null;
		coverUrl: string | null;
		publishYear: number | null;
		isAvailable: boolean;
		ownerName?: string;
		tags: { id: string; name: string; color: string | null }[];
	};

	const browseBooks = $derived<BrowseBook[] | null>(
		tab === 'contacts' ? contactBooks : tab === 'groups' ? groupBooks : null
	);

	// Al cambiar de contacto o grupo se limpian los filtros
	const browseKey = $derived(`${tab}:${selectedContact?.userId ?? ''}:${selectedGroup?.id ?? ''}`);
	$effect(() => {
		void browseKey;
		untrack(() => {
			browseSearch = '';
			activeBrowseTagIds.clear();
		});
	});

	const browseTags = $derived.by(() => {
		const map = new SvelteMap<string, { id: string; name: string; color: string | null }>();
		for (const book of browseBooks ?? []) {
			for (const tag of book.tags) {
				if (!map.has(tag.id)) map.set(tag.id, tag);
			}
		}
		return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
	});

	const filteredBrowseBooks = $derived.by(() => {
		let list = browseBooks ?? [];

		if (browseSearch.trim()) {
			const q = normalize(browseSearch);
			list = list.filter(
				(b) =>
					normalize(b.title).includes(q) ||
					b.authors.some((a: string) => normalize(a).includes(q)) ||
					(b.alternateTitle && normalize(b.alternateTitle).includes(q)) ||
					(b.ownerName && normalize(b.ownerName).includes(q))
			);
		}

		if (activeBrowseTagIds.size > 0) {
			list = list.filter((b) => b.tags.some((t) => activeBrowseTagIds.has(t.id)));
		}

		return list;
	});

	function toggleBrowseTag(id: string) {
		if (activeBrowseTagIds.has(id)) activeBrowseTagIds.delete(id);
		else activeBrowseTagIds.add(id);
	}

	// Mientras carga el contacto o grupo pulsado
	const loadingSelection = $derived(
		navigating.to?.url.pathname === '/library' &&
			(navigating.to.url.searchParams.has('contact') || navigating.to.url.searchParams.has('group'))
	);

	// ── Búsqueda en lo compartido por otros (estado en la URL) ─────────────────
	// Editable, pero vuelve a lo buscado cada vez que cambia la URL
	let searchInput = $derived(othersSearch.query);

	const searching = $derived(
		navigating.to?.url.pathname === '/library' &&
			navigating.to.url.searchParams.get('tab') === 'search'
	);

	const searchTagSet = $derived(new Set(othersSearch.tagIds));
	const searchResults = $derived(othersSearch.results ?? []);
	// Sin texto ni etiquetas la búsqueda trae todo lo compartido: vacía, no hay nada
	const nothingShared = $derived(
		!othersSearch.query && othersSearch.tagIds.length === 0 && searchResults.length === 0
	);

	function runSearch(query: string, tagIds: string[]) {
		const params = ['tab=search'];
		if (query.trim()) params.push(`q=${encodeURIComponent(query.trim())}`);
		for (const id of tagIds) params.push(`tag=${encodeURIComponent(id)}`);
		goto(`/library?${params.join('&')}`, { keepFocus: true, noScroll: true });
	}

	function toggleSearchTag(id: string) {
		const next = searchTagSet.has(id)
			? othersSearch.tagIds.filter((t) => t !== id)
			: [...othersSearch.tagIds, id];
		runSearch(searchInput, next);
	}
</script>

<div class="space-y-6">
	<!-- ── Cabecera + acciones ───────────────────────────────────────────── -->
	<div class="flex items-end justify-between gap-4">
		<div>
			<h1 class="font-serif text-2xl font-normal text-ink sm:text-3xl">{currentLibraryName}</h1>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<a href="/libraries" class="flex items-center gap-1.5 border btn-secondary px-3 py-2 text-sm">
				<BookOpen size={15} />
				<span class="hidden sm:inline">Libraries</span>
			</a>

			<a href="/tags" class="flex items-center gap-1.5 border btn-secondary px-3 py-2 text-sm">
				<Tag size={15} />
				<span class="hidden sm:inline">Tags</span>
			</a>

			<!-- Export dropdown -->
			<div class="relative">
				<button
					onclick={() => (exportOpen = !exportOpen)}
					class="flex items-center gap-1.5 border btn-secondary px-3 py-2 text-sm"
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
				href={libraryId ? `/library/add?libraryId=${libraryId}` : '/library/add'}
				class="flex items-center gap-1.5 border btn-primary px-3 py-2 text-sm"
			>
				<Plus size={15} weight="bold" />
				<span class="hidden sm:inline">Add</span>
			</a>
		</div>
	</div>

	<!-- ── Tabs ──────────────────────────────────────────────────────────── -->
	{#snippet tabLink(id: LibraryTab, label: string, count?: number)}
		<a
			href={tabHref(id)}
			class="flex items-center gap-2 border-b-2 pr-6 pb-3 text-sm whitespace-nowrap transition-colors
			{tab === id
				? 'border-brown-700 font-medium text-ink'
				: 'border-transparent text-ink-faint hover:text-ink-muted'}"
		>
			{label}
			{#if count !== undefined}
				<span class="text-xs {tab === id ? 'text-ink-muted' : 'text-ink-faint'}">{count}</span>
			{/if}
		</a>
	{/snippet}
	<nav class="flex overflow-x-auto border-b border-paper-border">
		{@render tabLink('mine', 'My books', (userBooks as UserBookWithDetails[]).length)}
		{@render tabLink('contacts', 'Contacts', contacts.length)}
		{@render tabLink('groups', 'Groups', groups.length)}
		{@render tabLink('search', 'Search')}
	</nav>

	<!-- ── Mis libros ────────────────────────────────────────────────────── -->
	{#if tab === 'mine'}
		{#if (userBooks as UserBookWithDetails[]).length > 0}
			<TagChips
				tags={mineTags()}
				activeIds={activeMineTagIds}
				onToggle={toggleMineTag}
				onClear={() => activeMineTagIds.clear()}
			/>

			<!-- Índice alfabético -->
			<div class="space-y-3">
				<div class="flex gap-1 border-b border-paper-border">
					<button
						onclick={() => toggleBy('title')}
						class="border-b-2 pb-2 text-xs font-medium transition-colors
						{by === 'title'
							? 'border-brown-700 text-ink'
							: 'border-transparent text-ink-faint hover:text-ink-muted'}"
					>
						By title
					</button>
					<button
						onclick={() => toggleBy('author')}
						class="ml-4 border-b-2 pb-2 text-xs font-medium transition-colors
						{by === 'author'
							? 'border-brown-700 text-ink'
							: 'border-transparent text-ink-faint hover:text-ink-muted'}"
					>
						By author
					</button>
				</div>

				<div class="flex flex-wrap gap-1">
					<button
						onclick={() => (activeLetter = null)}
						class="flex h-7 w-7 items-center justify-center text-xs transition-colors
						{activeLetter === null ? 'bg-brown-700 text-brown-50' : 'text-ink-muted hover:text-ink'}"
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
								{active ? 'bg-brown-700 text-brown-50' : 'text-ink hover:bg-paper-ui'}"
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

			<!-- Búsqueda + selección en bloque -->
			<div class="flex items-center gap-2">
				<div class="relative flex-1">
					<MagnifyingGlass
						size={16}
						class="absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
					/>
					<input
						type="search"
						bind:value={search}
						placeholder="Search by title or author..."
						class="w-full border border-field bg-paper-ui py-2 pr-4 pl-9 text-sm text-ink placeholder-ink-faint focus:border-brown-600 focus:bg-paper focus:ring-0"
					/>
				</div>
				<button
					type="button"
					onclick={() => (selectionMode ? exitSelectionMode() : (selectionMode = true))}
					class="flex shrink-0 items-center gap-1.5 border px-3 py-2 text-sm transition-colors
					{selectionMode
						? 'border-brown-700 bg-brown-700 text-brown-50'
						: 'border-paper-border text-ink-muted hover:border-ink-faint hover:text-ink'}"
				>
					<CheckSquare size={15} />
					<span class="hidden sm:inline">{selectionMode ? 'Cancel' : 'Select'}</span>
				</button>
			</div>

			{#if selectionMode}
				<div
					class="flex flex-wrap items-center gap-3 border border-paper-border bg-paper-ui px-4 py-3"
				>
					<button type="button" onclick={toggleSelectAll} class="text-sm link-action">
						{allFilteredSelected ? 'Deselect all' : 'Select all'}
					</button>
					<span class="text-sm text-ink-faint">{selectedIds.size} selected</span>

					{#if selectedIds.size > 0}
						<select
							bind:value={moveTargetLibraryId}
							class="border border-field bg-paper px-3 py-1.5 text-sm focus:border-brown-600 focus:ring-0"
						>
							<option value="">Move to…</option>
							{#each userLibraries as lib (lib.id)}
								<option value={lib.id}>{lib.name}</option>
							{/each}
						</select>
						<button
							type="button"
							onclick={moveSelected}
							disabled={!moveTargetLibraryId || moving}
							class="border btn-primary px-4 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
						>
							{moving ? 'Moving…' : 'Move'}
						</button>
						{#if moveError}
							<span class="text-xs text-red-700">{moveError}</span>
						{/if}
					{/if}
				</div>
			{/if}

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
						copyLabel: copyLabelByUserBookId.get(b.userBookId),
						href: `/library/${b.userBookId}`
					}))}
					selectable={selectionMode}
					{selectedIds}
					onToggleSelect={toggleSelect}
				/>
			{/if}
		{:else}
			<div class="flex flex-col items-center justify-center py-24 text-center">
				<div class="mb-6 font-serif text-6xl text-ink-faint">·</div>
				<p class="text-sm text-ink-faint">Your library is empty.</p>
				<a href="/library/add" class="mt-4 text-sm link-action"> Add your first book </a>
			</div>
		{/if}

		<!-- ── Contactos ─────────────────────────────────────────────────────── -->
	{:else if tab === 'contacts' && !selectedContact}
		<ContactList {contacts} hrefFor={(id) => `/library?tab=contacts&contact=${id}`} />

		<!-- ── Grupos ────────────────────────────────────────────────────────── -->
	{:else if tab === 'groups' && !selectedGroup}
		<GroupList
			{groups}
			hrefFor={(id) => `/library?tab=groups&group=${id}`}
			itemCounts={groupItemCounts}
			kind="book"
		/>

		<!-- ── Libros de un contacto o de un grupo ───────────────────────────── -->
	{:else if tab === 'contacts' || tab === 'groups'}
		<h2 class="font-serif text-xl font-normal text-ink">
			{tab === 'contacts' ? selectedContact?.name : selectedGroup?.name}
		</h2>

		{#if loadingSelection}
			<div class="flex justify-center py-12">
				<Spinner size="md" />
			</div>
		{:else if (browseBooks ?? []).length === 0}
			<p class="text-sm text-ink-faint">
				{tab === 'contacts'
					? 'No shared books from this contact.'
					: 'No one has shared books in this group yet.'}
			</p>
		{:else}
			<TagChips
				tags={browseTags}
				activeIds={activeBrowseTagIds}
				onToggle={toggleBrowseTag}
				onClear={() => activeBrowseTagIds.clear()}
			/>

			<div class="relative">
				<MagnifyingGlass
					size={16}
					class="absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
				/>
				<input
					type="search"
					bind:value={browseSearch}
					placeholder={tab === 'groups'
						? 'Search by title, author or person...'
						: 'Search by title or author...'}
					class="w-full border border-field bg-paper-ui py-2 pr-4 pl-9 text-sm text-ink placeholder-ink-faint focus:border-brown-600 focus:bg-paper focus:ring-0"
				/>
			</div>
			{#if filteredBrowseBooks.length === 0}
				<p class="py-12 text-center text-sm text-ink-faint">No results.</p>
			{:else}
				<p class="text-xs text-ink-faint">
					{filteredBrowseBooks.length}
					{filteredBrowseBooks.length === 1 ? 'book' : 'books'}
				</p>
				<BookGrid
					books={filteredBrowseBooks.map((b) => ({
						id: b.userBookId,
						title: b.title,
						authors: b.authors,
						coverUrl: b.coverUrl,
						publishYear: b.publishYear,
						isAvailable: b.isAvailable,
						ownerName: b.ownerName,
						href: `/library/${b.userBookId}`
					}))}
				/>
			{/if}
		{/if}

		<!-- ── Búsqueda en lo compartido ─────────────────────────────────────── -->
		<!-- Sin filtros, la lista entera: si está vacía es que nadie comparte nada (como en Movies) -->
	{:else if nothingShared}
		<div class="flex flex-col items-center justify-center py-24 text-center">
			<div class="mb-6 font-serif text-6xl text-ink-faint">·</div>
			<p class="max-w-sm text-sm text-ink-faint">
				Nobody has shared books with you yet. They show up here when someone in one of your groups
				shares a tag their books carry.
			</p>
			<a href="/groups" class="mt-4 text-sm link-action">Your groups</a>
		</div>
	{:else}
		<TagChips
			tags={sharedTagsForOthers}
			activeIds={searchTagSet}
			onToggle={toggleSearchTag}
			onClear={() => runSearch(searchInput, [])}
		/>

		<form
			class="flex gap-2"
			onsubmit={(e) => {
				e.preventDefault();
				runSearch(searchInput, othersSearch.tagIds);
			}}
		>
			<div class="relative flex-1">
				<MagnifyingGlass
					size={16}
					class="absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
				/>
				<input
					type="search"
					bind:value={searchInput}
					placeholder="Title, author, ISBN, tag or person..."
					class="w-full border border-field bg-paper-ui py-2 pr-4 pl-9 text-sm text-ink placeholder-ink-faint focus:border-brown-600 focus:bg-paper focus:ring-0"
				/>
			</div>
			<button
				type="submit"
				disabled={searching}
				class="border btn-primary px-4 py-2 text-sm disabled:opacity-50"
			>
				{#if searching}
					<Spinner size="sm" />
				{:else}
					Search
				{/if}
			</button>
		</form>

		{#if searchResults.length === 0}
			<p class="py-12 text-center text-sm text-ink-faint">
				{othersSearch.query ? `No results for "${othersSearch.query}".` : 'No results.'}
			</p>
		{:else}
			<p class="text-xs text-ink-faint">
				{searchResults.length}
				{searchResults.length === 1 ? 'book' : 'books'}
			</p>
			<BookGrid
				books={searchResults.map((b) => ({
					id: b.userBookId,
					title: b.title,
					authors: b.authors,
					coverUrl: b.coverUrl,
					publishYear: b.publishYear,
					isAvailable: b.isAvailable,
					ownerName: b.ownerName,
					href: `/library/${b.userBookId}`
				}))}
			/>
		{/if}
	{/if}
</div>
