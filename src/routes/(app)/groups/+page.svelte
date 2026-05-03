<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Plus, Users, ArrowRight } from 'phosphor-svelte';

	let { data, form } = $props();
	const { userGroups } = data;

	let showJoinForm = $state(false);
	let joinCode = $state('');
</script>

<div class="space-y-8">
	<div class="flex items-end justify-between">
		<div>
			<h1 class="font-serif text-2xl font-normal text-ink sm:text-3xl">Group</h1>
			<p class="mt-1 text-sm text-ink-faint">
				{userGroups.length}
				{userGroups.length === 1 ? 'group' : 'groups'}
			</p>
		</div>
		<div class="flex gap-2">
			<button
				onclick={() => (showJoinForm = !showJoinForm)}
				class="border border-paper-border px-4 py-2 text-sm text-ink-muted transition-colors hover:border-ink hover:text-ink"
			>
				Join
			</button>
			<a
				href={resolve('/groups/new')}
				class="flex items-center gap-1.5 border border-ink bg-ink px-4 py-2 text-sm text-paper hover:bg-ink/90"
			>
				<Plus size={16} weight="bold" /> New
			</a>
		</div>
	</div>

	<!-- Unirse con código -->
	{#if showJoinForm}
		<div class="border border-paper-border p-5">
			<p class="mb-3 text-xs font-medium tracking-widest text-ink-muted uppercase">
				Invitation code
			</p>
			<form method="POST" action="?/join" use:enhance class="flex gap-2">
				<input
					type="text"
					name="code"
					bind:value={joinCode}
					placeholder="ABC12345"
					autofocus
					maxlength="8"
					class="min-w-0 flex-1 border border-paper-border px-3 py-2 font-mono text-sm tracking-widest uppercase focus:border-ink focus:ring-0"
				/>
				<button
					type="submit"
					class="border border-ink bg-ink px-5 py-2 text-sm text-paper hover:bg-ink/90"
				>
					Enter
				</button>
			</form>
			{#if form?.joinError}
				<p class="mt-2 text-sm text-red-500">{form.joinError}</p>
			{/if}
		</div>
	{/if}

	<!-- Lista -->
	{#if userGroups.length === 0}
		<div class="flex flex-col items-center justify-center py-24 text-center">
			<Users size={48} weight="thin" class="mb-4 text-ink-faint" />
			<p class="text-sm text-ink-faint">You don't belong to any groups yet.</p>
			<div class="mt-4 flex gap-4 text-sm">
				<a href={resolve('/groups/new')} class="text-ink underline underline-offset-2"
					>Create group</a
				>
				<span class="text-ink-faint">|</span>
				<button onclick={() => (showJoinForm = true)} class="text-ink underline underline-offset-2">
					Join with code
				</button>
			</div>
		</div>
	{:else}
		<ul class="divide-y divide-paper-border">
			{#each userGroups as group (group.id)}
				<li>
					<a
						href={resolve(`/groups/${group.id}`)}
						class="-mx-2 flex items-center gap-4 px-2 py-4 transition-colors hover:bg-paper-ui"
					>
						<div
							class="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-paper-border bg-paper-ui"
						>
							<Users size={18} weight="regular" class="text-ink-faint" />
						</div>
						<div class="min-w-0 flex-1">
							<p class="font-medium text-ink">{group.name}</p>
							{#if group.description}
								<p class="truncate text-xs text-ink-faint">{group.description}</p>
							{/if}
						</div>
						<div class="flex flex-shrink-0 items-center gap-3">
							<span class="text-xs text-ink-faint">{group.memberCount}</span>
							<span
								class="text-xs text-ink-faint
								{group.role === 'owner' ? 'text-ink-muted' : ''}"
							>
								{group.role === 'owner' ? 'owner' : group.role === 'admin' ? 'admin' : ''}
							</span>
							<ArrowRight size={16} class="text-ink-faint" />
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
