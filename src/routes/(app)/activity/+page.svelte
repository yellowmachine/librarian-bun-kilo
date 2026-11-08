<script lang="ts">
	import BookGrid from '$lib/components/BookGrid.svelte';

	let { data } = $props();
	const { items } = $derived(data);
</script>

<div class="space-y-8">
	<div>
		<h1 class="font-serif text-2xl font-normal text-ink sm:text-3xl">Recent activity</h1>
		<p class="mt-1 text-sm text-ink-faint">
			Last {items.length} books and movies added across your groups
		</p>
	</div>

	{#if items.length > 0}
		<BookGrid
			books={items.map((item) => ({
				id: `${item.kind}:${item.id}`,
				title: item.title,
				authors: item.creators,
				coverUrl: item.coverUrl,
				publishYear: item.year,
				isAvailable: item.isAvailable,
				isMovie: item.kind === 'movie',
				href: item.href
			}))}
		/>
	{:else}
		<div class="flex flex-col items-center justify-center py-24 text-center">
			<div class="mb-6 font-serif text-6xl text-ink-faint">·</div>
			<p class="text-sm text-ink-faint">No recent activity in your groups.</p>
			<a href="/groups" class="mt-4 text-sm link-action"> Join or create a group </a>
		</div>
	{/if}
</div>
