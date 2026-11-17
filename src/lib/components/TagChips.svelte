<script lang="ts">
	import { tagChipStyle } from '$lib/tagColor';

	type ChipTag = { id: string; name: string; color: string | null };

	interface Props {
		tags: ChipTag[];
		activeIds: Set<string>;
		onToggle: (id: string) => void;
		onClear: () => void;
	}

	let { tags, activeIds, onToggle, onClear }: Props = $props();
</script>

{#if tags.length > 0}
	<div class="flex flex-wrap gap-1.5">
		{#each tags as tag (tag.id)}
			{@const active = activeIds.has(tag.id)}
			<button
				type="button"
				onclick={() => onToggle(tag.id)}
				aria-pressed={active}
				class="rounded-full border px-2.5 py-0.5 text-xs transition-colors {active
					? 'tag-chip-active'
					: 'tag-chip'}"
				style={tagChipStyle(tag.color)}
			>
				{tag.name}
			</button>
		{/each}
		{#if activeIds.size > 0}
			<button
				type="button"
				onclick={onClear}
				class="px-2.5 py-0.5 text-xs text-ink-faint hover:text-ink-muted"
			>
				Clear
			</button>
		{/if}
	</div>
{/if}
