<script lang="ts">
	import { ArrowRight, Users } from 'phosphor-svelte';

	interface Props {
		groups: { id: string; name: string; description: string | null; memberCount: number }[];
		/** Adónde lleva cada grupo */
		hrefFor: (groupId: string) => string;
	}

	let { groups, hrefFor }: Props = $props();
</script>

{#if groups.length === 0}
	<div class="py-16 text-center">
		<p class="text-sm text-ink-faint">You don't belong to any groups yet.</p>
		<a href="/groups" class="mt-4 inline-block text-sm link-action">Create or join a group</a>
	</div>
{:else}
	<ul class="divide-y divide-paper-border">
		{#each groups as g (g.id)}
			<li>
				<a
					href={hrefFor(g.id)}
					class="-mx-2 flex items-center gap-4 px-2 py-3 transition-colors hover:bg-paper-ui"
				>
					<div
						class="flex h-9 w-9 flex-shrink-0 items-center justify-center border border-paper-border bg-paper-ui"
					>
						<Users size={16} class="text-ink-faint" />
					</div>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm text-ink">{g.name}</p>
						{#if g.description}
							<p class="truncate text-xs text-ink-faint">{g.description}</p>
						{/if}
					</div>
					<span class="flex-shrink-0 text-xs text-ink-faint">
						{g.memberCount}
						{g.memberCount === 1 ? 'member' : 'members'}
					</span>
					<ArrowRight size={16} class="flex-shrink-0 text-ink-faint" />
				</a>
			</li>
		{/each}
	</ul>
{/if}
