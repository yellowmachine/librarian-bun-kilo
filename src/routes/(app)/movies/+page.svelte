<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { navigating } from '$app/state';
	import { MagnifyingGlass, Plus } from 'phosphor-svelte';
	import BookGrid from '$lib/components/BookGrid.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import TmdbAttribution from '$lib/components/TmdbAttribution.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import TagChips from '$lib/components/TagChips.svelte';
	import ContactList from '$lib/components/ContactList.svelte';
	import GroupList from '$lib/components/GroupList.svelte';
	import type { MoviesTab } from './+page.server';
	import type { UserMovieWithDetails } from '$lib/server/movies';
	import {
		MEDIA_FORMATS,
		MEDIA_FORMAT_LABELS,
		formatLine,
		type MediaFormat
	} from '$lib/mediaFormat';

	let { data } = $props();
	const {
		tab,
		userMovies,
		othersMovies,
		contacts,
		groups,
		userLibraries,
		libraryId,
		selectedContact,
		selectedGroup
	} = $derived(data);

	// La tab decide la lista; los filtros son los mismos para todas.
	type Row = UserMovieWithDetails & { ownerName?: string };
	const source: Row[] = $derived(tab === 'mine' ? userMovies : othersMovies);
	// En la tab de un contacto todas son suyas: no hace falta poner el dueño
	const showOwner = $derived(tab === 'groups' || tab === 'search');

	function tabHref(id: MoviesTab) {
		if (id === 'mine') return libraryId ? `/movies?libraryId=${libraryId}` : '/movies';
		return `/movies?tab=${id}`;
	}

	// Al cambiar de tab, contacto o grupo se limpian los filtros
	const filterKey = $derived(`${tab}:${selectedContact?.userId ?? ''}:${selectedGroup?.id ?? ''}`);
	$effect(() => {
		void filterKey;
		untrack(() => {
			search = '';
			activeTagIds.clear();
			activeFormat = null;
		});
	});

	const loadingSelection = $derived(
		navigating.to?.url.pathname === '/movies' &&
			(navigating.to.url.searchParams.has('contact') || navigating.to.url.searchParams.has('group'))
	);

	const heading = $derived(
		libraryId ? (userLibraries.find((lib) => lib.id === libraryId)?.name ?? 'Movies') : 'Movies'
	);

	let search = $state('');
	let activeFormat = $state<MediaFormat | null>(null);
	const activeTagIds = new SvelteSet<string>();

	// Etiquetas presentes en la videoteca, para filtrar
	const tagsInUse = $derived(
		source
			.flatMap((m) => m.tags)
			.filter((tag, i, all) => all.findIndex((t) => t.id === tag.id) === i)
			.sort((a, b) => a.name.localeCompare(b.name))
	);

	function toggleTag(id: string) {
		if (activeTagIds.has(id)) activeTagIds.delete(id);
		else activeTagIds.add(id);
	}

	function normalize(s: string) {
		return s
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase();
	}

	// Solo se ofrecen como filtro los formatos que el usuario tiene.
	const formatsInUse = $derived(MEDIA_FORMATS.filter((f) => source.some((m) => m.format === f)));

	const filtered = $derived.by(() => {
		let list = source;
		if (activeFormat) list = list.filter((m) => m.format === activeFormat);
		if (activeTagIds.size > 0)
			list = list.filter((m) => m.tags.some((t) => activeTagIds.has(t.id)));
		if (search.trim()) {
			const q = normalize(search);
			list = list.filter(
				(m) =>
					normalize(m.title).includes(q) ||
					(m.originalTitle && normalize(m.originalTitle).includes(q)) ||
					m.directors.some((d) => normalize(d).includes(q)) ||
					(m.ownerName !== undefined && normalize(m.ownerName).includes(q))
			);
		}
		return list;
	});
</script>

<div class="space-y-6">
	<div class="flex items-end justify-between gap-4">
		<h1 class="font-serif text-2xl font-normal text-ink sm:text-3xl">{heading}</h1>
		<div class="flex shrink-0 items-center gap-2">
			{#if tab === 'mine' && userLibraries.length > 1}
				<select
					aria-label="Library"
					value={libraryId ?? ''}
					onchange={(e) => {
						const id = e.currentTarget.value;
						goto(id ? `/movies?libraryId=${id}` : '/movies');
					}}
					class="border border-paper-border bg-paper px-3 py-2 text-sm text-ink-muted focus:border-brown-600 focus:ring-0"
				>
					<option value="">All libraries</option>
					{#each userLibraries as lib (lib.id)}
						<option value={lib.id}>{lib.name}</option>
					{/each}
				</select>
			{/if}
			<a
				href={libraryId ? `/movies/add?libraryId=${libraryId}` : '/movies/add'}
				class="flex items-center gap-1.5 border btn-primary px-3 py-2 text-sm"
			>
				<Plus size={15} weight="bold" />
				<span class="hidden sm:inline">Add</span>
			</a>
		</div>
	</div>

	{#snippet tabLink(id: MoviesTab, label: string, count?: number)}
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
		{@render tabLink('mine', 'My movies', userMovies.length)}
		{@render tabLink('contacts', 'Contacts', contacts.length)}
		{@render tabLink('groups', 'Groups', groups.length)}
		{@render tabLink('search', 'Search')}
	</nav>

	{#if tab === 'contacts' && !selectedContact}
		<ContactList {contacts} hrefFor={(id) => `/movies?tab=contacts&contact=${id}`} />
	{:else if tab === 'groups' && !selectedGroup}
		<GroupList {groups} hrefFor={(id) => `/movies?tab=groups&group=${id}`} />
	{:else}
		{#if selectedContact || selectedGroup}
			<h2 class="font-serif text-xl font-normal text-ink">
				{selectedContact?.name ?? selectedGroup?.name}
			</h2>
		{/if}

		{#if loadingSelection}
			<div class="flex justify-center py-12">
				<Spinner size="md" />
			</div>
		{:else if source.length > 0}
			<div class="space-y-3">
				<TagChips
					tags={tagsInUse}
					activeIds={activeTagIds}
					onToggle={toggleTag}
					onClear={() => activeTagIds.clear()}
				/>

				{#if formatsInUse.length > 1}
					<div class="flex flex-wrap gap-1.5">
						<button
							onclick={() => (activeFormat = null)}
							class="rounded-full border px-2.5 py-0.5 text-xs transition-colors
						{activeFormat === null
								? 'border-brown-700 bg-brown-700 text-brown-50'
								: 'border-paper-border text-ink-muted hover:border-ink-faint'}"
						>
							All
						</button>
						{#each formatsInUse as f (f)}
							<button
								onclick={() => (activeFormat = activeFormat === f ? null : f)}
								class="rounded-full border px-2.5 py-0.5 text-xs transition-colors
							{activeFormat === f
									? 'border-brown-700 bg-brown-700 text-brown-50'
									: 'border-paper-border text-ink-muted hover:border-ink-faint'}"
							>
								{MEDIA_FORMAT_LABELS[f]}
							</button>
						{/each}
					</div>
				{/if}

				<div class="relative">
					<MagnifyingGlass
						size={16}
						class="absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
					/>
					<input
						type="search"
						bind:value={search}
						placeholder={showOwner
							? 'Search by title, director or owner...'
							: 'Search by title or director...'}
						class="w-full border border-paper-border bg-paper-ui py-2 pr-4 pl-9 text-sm text-ink placeholder-ink-faint focus:border-brown-600 focus:bg-paper focus:ring-0"
					/>
				</div>
			</div>

			{#if filtered.length === 0}
				<p class="py-12 text-center text-sm text-ink-faint">No results.</p>
			{:else}
				<BookGrid
					books={filtered.map((m) => ({
						id: m.userMovieId,
						title: m.title,
						authors: m.directors,
						coverUrl: m.coverUrl,
						publishYear: m.releaseYear,
						isAvailable: m.isAvailable,
						copyLabel:
							showOwner && m.ownerName !== undefined
								? `${formatLine(m.format, m.edition)} · ${m.ownerName}`
								: formatLine(m.format, m.edition),
						href: `/movies/${m.userMovieId}`
					}))}
				/>
			{/if}
		{:else if tab === 'contacts'}
			<p class="text-sm text-ink-faint">No shared movies from this contact.</p>
		{:else if tab === 'groups'}
			<p class="text-sm text-ink-faint">No one has shared movies in this group yet.</p>
		{:else if tab === 'search'}
			<div class="flex flex-col items-center justify-center py-24 text-center">
				<div class="mb-6 font-serif text-6xl text-ink-faint">·</div>
				<p class="max-w-sm text-sm text-ink-faint">
					Nobody has shared movies with you yet. They show up here when someone in one of your
					groups shares a tag their movies carry.
				</p>
				<a href="/groups" class="mt-4 text-sm link-action">Your groups</a>
			</div>
		{:else}
			<div class="flex flex-col items-center justify-center py-24 text-center">
				<div class="mb-6 font-serif text-6xl text-ink-faint">·</div>
				<p class="text-sm text-ink-faint">
					{libraryId ? 'No movies in this library yet.' : 'Your video library is empty.'}
				</p>
				<a href="/movies/add" class="mt-4 text-sm link-action"> Add your first movie </a>
			</div>
		{/if}
	{/if}

	<TmdbAttribution />
</div>
