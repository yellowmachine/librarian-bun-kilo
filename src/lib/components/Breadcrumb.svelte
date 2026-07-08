<script lang="ts">
	import { page } from '$app/state';

	type Crumb = { label: string; href?: string };

	interface PageData {
		book?: { title?: string; libraryId?: string | null };
		userLibraries?: { id: string; name: string }[];
		group?: { name?: string };
		loan?: { title?: string };
	}

	const crumbs = $derived.by((): Crumb[] => {
		const path = page.url.pathname;
		const data = page.data as PageData;

		// Raíces — sin breadcrumb
		if (path === '/library' || path === '/groups' || path === '/loans') return [];

		if (path.startsWith('/library')) {
			if (path === '/library/add') {
				return [{ label: 'Library', href: '/library' }, { label: 'Add book' }];
			}
			if (/^\/library\/[^/]+$/.test(path)) {
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
