<script lang="ts">
	import BookGrid from '$lib/components/BookGrid.svelte';
	import type { GroupActivityBook } from '$lib/server/groups';

	let { data } = $props();
	const { books } = $derived(data);
</script>

<div class="space-y-8">
	<div>
		<h1 class="font-serif text-2xl font-normal text-ink sm:text-3xl">Recent activity</h1>
		<p class="mt-1 text-sm text-ink-faint">Last {books.length} books added across your groups</p>
	</div>

	{#if books.length > 0}
		<BookGrid
			books={(books as GroupActivityBook[]).map((b) => ({
				id: b.userBookId,
				title: b.title,
				authors: b.authors,
				coverUrl: b.coverUrl,
				publishYear: b.publishYear,
				isAvailable: b.isAvailable,
				href: `/library/${b.userBookId}`
			}))}
		/>
	{:else}
		<div class="flex flex-col items-center justify-center py-24 text-center">
			<div class="mb-6 font-serif text-6xl text-ink-faint">·</div>
			<p class="text-sm text-ink-faint">No recent activity in your groups.</p>
			<a href="/groups" class="mt-4 text-sm text-ink underline underline-offset-2">
				Join or create a group
			</a>
		</div>
	{/if}
</div>
