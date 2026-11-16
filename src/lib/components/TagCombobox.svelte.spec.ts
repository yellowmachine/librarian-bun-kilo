import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TagCombobox from './TagCombobox.svelte';

const availableTags = [{ id: 't1', name: 'Fantasy', color: '#ff0000' }];

describe('TagCombobox.svelte', () => {
	it('offers to create and add a new tag in one step', async () => {
		render(TagCombobox, { availableTags });

		await page.getByPlaceholder('Search or create tag...').fill('Cozy');

		await expect
			.element(page.getByRole('button', { name: 'Create and add «Cozy»' }))
			.toBeInTheDocument();
	});

	it('does not offer to create a tag already on the item', async () => {
		render(TagCombobox, { availableTags, assignedTags: [{ name: 'Cozy' }] });

		await page.getByPlaceholder('Search or create tag...').fill('cozy');

		await expect
			.element(page.getByRole('button', { name: /Create and add/ }))
			.not.toBeInTheDocument();
	});
});
