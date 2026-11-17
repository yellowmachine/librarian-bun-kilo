<script lang="ts">
	import { page } from '$app/state';

	type Crumb = { label: string; href?: string };

	interface PageData {
		book?: { title?: string; libraryId?: string | null; ownerId?: string };
		borrowInfo?: { ownerName?: string } | null;
		selectedContact?: { userId: string; name: string } | null;
		selectedGroup?: { id: string; name: string } | null;
		movie?: { title?: string; libraryId?: string | null; ownerId?: string; ownerName?: string };
		isOwner?: boolean;
		userLibraries?: { id: string; name: string }[];
		group?: { name?: string };
		loan?: { title?: string };
	}

	const crumbs = $derived.by((): Crumb[] => {
		const path = page.url.pathname;
		const data = page.data as PageData;

		// Biblioteca y videoteca: lo de un contacto o un grupo cuelga de su tab
		if (path === '/library' || path === '/movies') {
			const section = path === '/library' ? 'Library' : 'Movies';
			if (data.selectedContact) {
				return [
					{ label: `${section} · Contacts`, href: `${path}?tab=contacts` },
					{ label: data.selectedContact.name }
				];
			}
			if (data.selectedGroup) {
				return [
					{ label: `${section} · Groups`, href: `${path}?tab=groups` },
					{ label: data.selectedGroup.name }
				];
			}
			return [];
		}

		// Raíces — sin breadcrumb
		if (path === '/groups' || path === '/loans') return [];

		if (path.startsWith('/movies')) {
			if (path === '/movies/add') {
				return [{ label: 'Movies', href: '/movies' }, { label: 'Add movie' }];
			}
			if (/^\/movies\/[^/]+$/.test(path)) {
				// Película de otra persona: cuelga de sus películas en la tab de contactos
				if (data.isOwner === false && data.movie?.ownerId) {
					return [
						{
							label: `Movies · ${data.movie.ownerName ?? 'Contacts'}`,
							href: `/movies?tab=contacts&contact=${data.movie.ownerId}`
						},
						{ label: data.movie.title ?? '…' }
					];
				}
				const library = data.userLibraries?.find((lib) => lib.id === data.movie?.libraryId);
				return [
					{
						label: library ? `Movies · ${library.name}` : 'Movies',
						href: library ? `/movies?libraryId=${library.id}` : '/movies'
					},
					{ label: data.movie?.title ?? '…' }
				];
			}
		}

		if (path.startsWith('/library')) {
			if (path === '/library/add') {
				return [{ label: 'Library', href: '/library' }, { label: 'Add book' }];
			}
			if (/^\/library\/[^/]+$/.test(path)) {
				// Libro de otra persona: cuelga de sus libros en la tab de contactos
				if (data.isOwner === false && data.book?.ownerId) {
					return [
						{
							label: `Library · ${data.borrowInfo?.ownerName ?? 'Contacts'}`,
							href: `/library?tab=contacts&contact=${data.book.ownerId}`
						},
						{ label: data.book.title ?? '…' }
					];
				}
				const library = data.userLibraries?.find((lib) => lib.id === data.book?.libraryId);
				return [
					{
						label: library?.name ?? 'Library',
						href: library ? `/library?libraryId=${library.id}` : '/library'
					},
					{ label: data.book?.title ?? '…' }
				];
			}
		}

		if (path === '/account/ai-usage') {
			return [{ label: 'Tu cuenta', href: '/account' }, { label: 'Consumo de IA' }];
		}

		if (path.startsWith('/tags')) {
			return [{ label: 'Library', href: '/library' }, { label: 'Tags' }];
		}

		if (path.startsWith('/groups')) {
			if (path === '/groups/new') {
				return [{ label: 'Groups', href: '/groups' }, { label: 'New group' }];
			}
			const groupId = path.split('/')[2];
			if (/^\/groups\/[^/]+\/search$/.test(path)) {
				return [
					{ label: 'Groups', href: '/groups' },
					{ label: data.group?.name ?? '…', href: `/groups/${groupId}` },
					{ label: 'Search' }
				];
			}
			if (/^\/groups\/[^/]+$/.test(path)) {
				return [{ label: 'Groups', href: '/groups' }, { label: data.group?.name ?? '…' }];
			}
		}

		if (path.startsWith('/loans')) {
			if (/^\/loans\/[^/]+$/.test(path)) {
				return [{ label: 'Loans', href: '/loans' }, { label: data.loan?.title ?? '…' }];
			}
		}

		if (path.startsWith('/books')) {
			if (/^\/books\/[^/]+\/reviews$/.test(path)) {
				return [
					{ label: 'Library', href: '/library' },
					{ label: data.book?.title ?? '…' },
					{ label: 'Reviews' }
				];
			}
		}

		return [];
	});
</script>

{#if crumbs.length > 0}
	<nav aria-label="Breadcrumb" class="mb-6 flex items-center gap-1.5 text-xs text-ink-faint">
		{#each crumbs as crumb, i (crumb.label)}
			{#if i > 0}
				<span aria-hidden="true">›</span>
			{/if}
			{#if crumb.href}
				<a href={crumb.href} class="hover:text-ink-muted">{crumb.label}</a>
			{:else}
				<span class="text-ink-muted">{crumb.label}</span>
			{/if}
		{/each}
	</nav>
{/if}
