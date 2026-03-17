<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import BookGrid from '$lib/components/BookGrid.svelte';

	const { Story } = defineMeta({
		title: 'Librarian/BookGrid',
		component: BookGrid,
		tags: ['autodocs'],
		parameters: { layout: 'fullscreen' }
	});

	const BOOKS = [
		{
			id: 'OL27448W',
			title: 'The Lord of the Rings',
			authors: ['J.R.R. Tolkien'],
			coverUrl: 'https://covers.openlibrary.org/b/id/9255566-M.jpg',
			publishYear: 1954
		},
		{
			id: 'OL262714W',
			title: 'The Silmarillion',
			authors: ['J.R.R. Tolkien'],
			coverUrl: 'https://covers.openlibrary.org/b/id/8235796-M.jpg',
			publishYear: 1977
		},
		{
			id: 'OL95865W',
			title: 'The Hobbit',
			authors: ['J.R.R. Tolkien'],
			coverUrl: 'https://covers.openlibrary.org/b/id/6979861-M.jpg',
			publishYear: 1937
		},
		{
			id: 'OL59853W',
			title: 'Dune',
			authors: ['Frank Herbert'],
			coverUrl: 'https://covers.openlibrary.org/b/id/8231504-M.jpg',
			publishYear: 1965
		},
		{
			id: 'OL893415W',
			title: 'Neuromancer',
			authors: ['William Gibson'],
			coverUrl: 'https://covers.openlibrary.org/b/id/8587729-M.jpg',
			publishYear: 1984
		},
		{
			id: 'OL118077W',
			title: 'Foundation',
			authors: ['Isaac Asimov'],
			coverUrl: 'https://covers.openlibrary.org/b/id/8397879-M.jpg',
			publishYear: 1951
		},
		{
			id: 'no-cover-1',
			title: 'A Book Without Cover',
			authors: ['Unknown Author'],
			coverUrl: null,
			publishYear: 2001
		},
		{
			id: 'OL82537W',
			title: 'Nineteen Eighty-Four',
			authors: ['George Orwell'],
			coverUrl: 'https://covers.openlibrary.org/b/id/8575708-M.jpg',
			publishYear: 1949,
			isAvailable: false
		}
	];
</script>

<!-- Pocos libros (3) -->
<Story name="Grid – 3 libros">
	{#snippet template()}
		<div class="p-6">
			<BookGrid books={BOOKS.slice(0, 3)} />
		</div>
	{/snippet}
</Story>

<!-- Fila completa (6) -->
<Story name="Grid – 6 libros">
	{#snippet template()}
		<div class="p-6">
			<BookGrid books={BOOKS.slice(0, 6)} />
		</div>
	{/snippet}
</Story>

<!-- Dos filas con variedad: sin portada y prestado -->
<Story name="Grid – 8 libros (con sin portada y prestado)">
	{#snippet template()}
		<div class="p-6">
			<BookGrid books={BOOKS} />
		</div>
	{/snippet}
</Story>
