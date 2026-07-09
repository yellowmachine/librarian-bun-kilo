<script lang="ts">
	import BookCard from './BookCard.svelte';

	type Props = {
		book: { title: string; authors: string[]; coverUrl: string | null };
		matchType: 'exact' | 'isbn' | 'title-author';
		libraryName: string;
		onconfirm: () => void;
		oncancel: () => void;
	};

	let { book, matchType, libraryName, onconfirm, oncancel }: Props = $props();

	const reason = $derived(
		matchType === 'exact'
			? 'this exact book'
			: matchType === 'isbn'
				? 'a book with the same ISBN'
				: 'a book with the same title and author'
	);
</script>

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
	role="dialog"
	aria-modal="true"
>
	<div class="w-full max-w-sm border border-paper-border bg-paper px-6 py-5 shadow-lg">
		<p class="text-sm text-ink">
			You already have {reason} in <strong>{libraryName}</strong>:
		</p>
		<div class="mt-3 border border-paper-border p-3">
			<BookCard title={book.title} authors={book.authors} coverUrl={book.coverUrl} variant="list" />
		</div>
		<p class="mt-3 text-sm text-ink-muted">Do you want to add it anyway?</p>
		<div class="mt-5 flex justify-end gap-2">
			<button
				type="button"
				onclick={oncancel}
				class="border border-paper-border px-4 py-1.5 text-sm text-ink-muted hover:border-ink-faint"
			>
				Cancel
			</button>
			<button
				type="button"
				onclick={onconfirm}
				class="border border-ink bg-ink px-4 py-1.5 text-sm text-paper hover:bg-ink/90"
			>
				Add anyway
			</button>
		</div>
	</div>
</div>
