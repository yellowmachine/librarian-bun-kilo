<script lang="ts">
	import { UsersThree } from 'phosphor-svelte';

	interface Props {
		/** Etiquetas del libro o la película */
		tags: { id: string; name: string }[];
		/** En qué grupos se comparte cada una de esas etiquetas */
		shares: { tagId: string; groupId: string; groupName: string }[];
		kind: 'book' | 'movie';
	}

	let { tags, shares, kind }: Props = $props();

	// Un grupo por línea, con las etiquetas por las que lo ve
	const byGroup = $derived.by(() => {
		const tagName = new Map(tags.map((t) => [t.id, t.name]));
		const groups: { id: string; name: string; tagNames: string[] }[] = [];
		for (const s of shares) {
			const name = tagName.get(s.tagId);
			if (!name) continue;
			let g = groups.find((x) => x.id === s.groupId);
			if (!g) groups.push((g = { id: s.groupId, name: s.groupName, tagNames: [] }));
			g.tagNames.push(name);
		}
		return groups;
	});
</script>

<div class="flex gap-2 text-xs text-ink-faint">
	<UsersThree size={14} class="mt-px flex-shrink-0" />
	{#if byGroup.length === 0}
		<p>
			Only you can see this {kind}. To share it, give it a tag and share that tag from a
			<a href="/groups" class="link-action">group's page</a>.
		</p>
	{:else}
		<p>
			Visible in
			{#each byGroup as g, i (g.id)}
				{#if i > 0}{i === byGroup.length - 1 ? ' and ' : ', '}{/if}
				<a href={`/groups/${g.id}`} class="link-action">{g.name}</a>
				<span>(via {g.tagNames.join(', ')})</span>
			{/each}.
		</p>
	{/if}
</div>
