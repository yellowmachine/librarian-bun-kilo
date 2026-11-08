<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Caracol from '$lib/components/Caracol.svelte';
	import BookGrid from '$lib/components/BookGrid.svelte';

	const { Story } = defineMeta({
		title: 'Librarian/Paleta',
		parameters: { layout: 'fullscreen' }
	});

	/** La escala marrón (layout.css), con su contraste sobre el papel (#fbf7f0). */
	const ESCALA = [
		{ paso: 50, hex: '#fcf6ed', contraste: '1.0' },
		{ paso: 100, hex: '#f7ebdc', contraste: '1.1' },
		{ paso: 200, hex: '#ebd5c1', contraste: '1.3' },
		{ paso: 300, hex: '#d6b7a2', contraste: '1.8' },
		{ paso: 400, hex: '#b79280', contraste: '2.6' },
		{ paso: 500, hex: '#977264', contraste: '4.0' },
		{ paso: 600, hex: '#78584e', contraste: '6.0' },
		{ paso: 700, hex: '#57403a', contraste: '8.9' },
		{ paso: 800, hex: '#43302c', contraste: '11.6' },
		{ paso: 900, hex: '#2f231f', contraste: '14.2' },
		{ paso: 950, hex: '#1d1714', contraste: '16.6' }
	];

	/** La tinta del texto, con su contraste sobre el papel y sobre paper-ui. */
	const TINTA = [
		{ nombre: 'ink', hex: '#1c1917', contraste: '16.4 / 15.2' },
		{ nombre: 'ink-muted', hex: '#57534e', contraste: '7.1 / 6.6' },
		{ nombre: 'ink-faint', hex: '#716a65', contraste: '5.0 / 4.6' }
	];

	/** Para qué es cada tono en las acciones. */
	const PAPELES = [
		['700', 'Primary button background (cream text, 8.9:1); the icon’s brown'],
		['800', 'Primary button hover, pressed'],
		['600', 'Links and text buttons (6.0:1 on paper)'],
		['300', 'Secondary button border, selected tag border'],
		['100', 'Selected tag background, secondary button hover'],
		['600', 'Focus: field border and keyboard outline']
	];

	const LIBROS = [
		{
			id: 'OL27448W',
			title: 'The Lord of the Rings',
			authors: ['J.R.R. Tolkien'],
			coverUrl: 'https://covers.openlibrary.org/b/id/9255566-M.jpg',
			publishYear: 1954
		},
		{
			id: 'OL59853W',
			title: 'Dune',
			authors: ['Frank Herbert'],
			coverUrl: 'https://covers.openlibrary.org/b/id/8231504-M.jpg',
			publishYear: 1965
		},
		{
			id: 'sin-portada',
			title: 'A Book Without Cover',
			authors: ['Unknown Author'],
			coverUrl: null,
			publishYear: 2001,
			isAvailable: false
		}
	];
</script>

<!-- Unas muestras de la app: `marron` con las acciones en marrón, sin él como hoy (tinta). -->
{#snippet muestras(marron: boolean)}
	<div class="space-y-6 bg-paper-ui p-6">
		<div class="flex items-center gap-6 border-b border-paper-border bg-paper px-4 py-3">
			<span class="font-serif text-lg text-ink">Librarian</span>
			<span class={['text-sm', marron ? 'text-brown-700' : 'text-ink']}>Library</span>
			<span class="text-sm text-ink-muted">Movies</span>
			<span class="text-sm text-ink-muted">Loans</span>
		</div>

		<div class="space-y-4 border border-paper-border bg-paper p-5">
			<h2 class="font-serif text-xl text-ink">Add a book</h2>
			<label class="block space-y-1">
				<span class="text-xs font-medium tracking-widest text-ink-muted uppercase">Title</span>
				<!-- Con el anillo de foco puesto, para verlo. -->
				<input
					value="The Hobbit"
					class={[
						'w-full border bg-paper px-3 py-2 text-sm text-ink ring-2 focus:outline-none',
						marron ? 'border-brown-600 ring-brown-600/20' : 'border-ink-faint ring-ink-faint/30'
					]}
				/>
			</label>

			<div class="flex flex-wrap items-center gap-2">
				<span class="text-xs font-medium tracking-widest text-ink-muted uppercase">Tags</span>
				<span
					class={[
						'rounded-full border px-2.5 py-0.5 text-xs',
						marron ? 'border-brown-300 bg-brown-100 text-brown-800' : 'border-ink bg-ink text-paper'
					]}>Fantasy</span
				>
				<span class="rounded-full border border-paper-border px-2.5 py-0.5 text-xs text-ink-muted"
					>Classics</span
				>
				<button
					type="button"
					class={[
						'ml-auto text-xs underline underline-offset-2',
						marron ? 'text-brown-600 hover:text-brown-700' : 'text-ink-faint hover:text-ink'
					]}>Suggest with AI</button
				>
			</div>

			<div class="flex gap-3">
				<button
					type="button"
					class={[
						'flex-1 border py-2.5 text-sm',
						marron
							? 'border-brown-300 text-brown-700 hover:bg-brown-100'
							: 'border-paper-border text-ink-muted hover:border-ink-faint'
					]}>Cancel</button
				>
				<button
					type="button"
					class={[
						'flex-1 border py-2.5 text-sm',
						marron
							? 'border-brown-700 bg-brown-700 text-brown-50 hover:bg-brown-800'
							: 'border-ink bg-ink text-paper hover:bg-ink/90'
					]}>Add to my library</button
				>
			</div>
			<p class="text-xs text-red-700">There is already a copy with this ISBN.</p>
		</div>

		<div class="border border-paper-border bg-paper p-5">
			<BookGrid books={LIBROS} />
		</div>

		<div class="flex justify-center">
			<div
				class="flex max-w-xs flex-col items-center gap-3 rounded-2xl border border-paper-border bg-paper/95 p-5 text-center shadow-lg"
			>
				<Caracol class={['w-20', marron ? 'text-brown-600' : 'text-accent']} />
				<p class="text-sm text-ink-muted">Reading the covers…</p>
			</div>
		</div>
	</div>
{/snippet}

<Story name="Escala marrón">
	{#snippet template()}
		<div class="space-y-6 bg-paper p-6">
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
				{#each ESCALA as c (c.paso)}
					<div class="border border-paper-border bg-paper">
						<div class="h-16" style:background-color={c.hex}></div>
						<div class="px-2 py-1.5 text-xs">
							<div class="font-medium text-ink">brown-{c.paso}</div>
							<div class="text-ink-muted">{c.hex} · {c.contraste}:1</div>
						</div>
					</div>
				{/each}
			</div>
			<div class="space-y-1">
				{#each TINTA as t (t.nombre)}
					<p class="text-sm" style:color={t.hex}>
						{t.nombre} · {t.hex} · {t.contraste}:1 on paper / paper-ui
					</p>
				{/each}
			</div>
			<ul class="space-y-1 text-sm text-ink-muted">
				{#each PAPELES as [paso, uso] (paso)}
					<li><strong class="text-ink">brown-{paso}</strong> — {uso}</li>
				{/each}
			</ul>
		</div>
	{/snippet}
</Story>

<!-- Lo mismo dos veces: hoy, y con las acciones en marrón. -->
<Story name="Hoy y en marrón">
	{#snippet template()}
		<div class="grid lg:grid-cols-2">
			<div>
				<p class="bg-paper px-6 pt-4 text-xs tracking-widest text-ink-faint uppercase">Today</p>
				{@render muestras(false)}
			</div>
			<div>
				<p class="bg-paper px-6 pt-4 text-xs tracking-widest text-ink-faint uppercase">Brown</p>
				{@render muestras(true)}
			</div>
		</div>
	{/snippet}
</Story>
