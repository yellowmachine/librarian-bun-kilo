<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Caracol from '$lib/components/Caracol.svelte';

	const { Story } = defineMeta({
		title: 'Librarian/Caracol',
		component: Caracol,
		tags: ['autodocs'],
		argTypes: {
			modo: { control: 'inline-radio', options: ['reptar', 'asomar', 'dibujar'] }
		},
		args: { modo: 'reptar', class: 'w-40 text-accent' }
	});
</script>

<!-- El de las esperas -->
<Story name="Reptar" />

<Story name="Asomar" args={{ modo: 'asomar' }} />

<Story name="Dibujar" args={{ modo: 'dibujar' }} />
