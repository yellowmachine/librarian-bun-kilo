<script lang="ts">
	import { readableTagTextColor } from '$lib/tagColor';

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
				class="rounded-full border px-2.5 py-0.5 text-xs transition-colors"
				style={active
					? tag.color
						? `background-color: ${tag.color}22; border-color: ${tag.color}; color: ${readableTagTextColor(tag.color)}`
						: 'background-color: var(--color-paper-border); border-color: #8a8480; color: #3a3430'
					: tag.color
						? `border-color: ${tag.color}44; color: ${readableTagTextColor(tag.color)}`
						: 'border-color: var(--color-paper-border); color: var(--color-ink-faint)'}
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
