<script lang="ts">
	import { ArrowRight } from 'phosphor-svelte';

	interface Props {
		contacts: { userId: string; name: string }[];
		/** Adónde lleva cada contacto */
		hrefFor: (userId: string) => string;
	}

	let { contacts, hrefFor }: Props = $props();
</script>

{#if contacts.length === 0}
	<div class="py-16 text-center">
		<p class="text-sm text-ink-faint">
			Your contacts are the people in your groups. You don't have any yet.
		</p>
		<a href="/groups" class="mt-4 inline-block text-sm link-action">Create or join a group</a>
	</div>
{:else}
	<ul class="divide-y divide-paper-border">
		{#each contacts as c (c.userId)}
			<li>
				<a
					href={hrefFor(c.userId)}
					class="-mx-2 flex items-center gap-4 px-2 py-3 transition-colors hover:bg-paper-ui"
				>
					<div
						class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-paper-border bg-paper-ui font-serif text-sm text-ink-muted"
					>
						{c.name.charAt(0).toUpperCase()}
					</div>
					<span class="min-w-0 flex-1 truncate text-sm text-ink">{c.name}</span>
					<ArrowRight size={16} class="flex-shrink-0 text-ink-faint" />
				</a>
			</li>
		{/each}
	</ul>
{/if}
