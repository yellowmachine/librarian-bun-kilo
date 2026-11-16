import { page, userEvent } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TagSelectorLocal from './TagSelectorLocal.svelte';

const availableTags = [{ id: 't1', name: 'Fantasy', color: '#ff0000' }];

describe('TagSelectorLocal.svelte', () => {
	it('creates and adds a new tag in one click', async () => {
		render(TagSelectorLocal, { availableTags });

		await page.getByPlaceholder('Search or create tag...').fill('Cozy');
		await page.getByRole('button', { name: 'Create and add «Cozy»' }).click();

		await expect.element(page.getByRole('button', { name: 'Remove tag Cozy' })).toBeInTheDocument();
		await expect.element(page.getByLabelText('Color for tag Cozy')).toBeInTheDocument();
		await expect.element(page.getByPlaceholder('Search or create tag...')).toHaveValue('');
	});

	it('creates and adds a new tag with Enter', async () => {
		render(TagSelectorLocal, { availableTags });

		const input = page.getByPlaceholder('Search or create tag...');
		await input.fill('Cozy');
		await userEvent.keyboard('{Enter}');

		await expect.element(page.getByRole('button', { name: 'Remove tag Cozy' })).toBeInTheDocument();
	});

	it('does not offer to create a tag that already exists', async () => {
		render(TagSelectorLocal, { availableTags });

		await page.getByPlaceholder('Search or create tag...').fill('fantasy');

		await expect.element(page.getByRole('button', { name: 'Fantasy' })).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: /Create and add/ }))
			.not.toBeInTheDocument();
	});
});
