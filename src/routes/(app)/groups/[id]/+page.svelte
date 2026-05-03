<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { ArrowLeft, Copy, ArrowsClockwise, X } from 'phosphor-svelte';
	import { resolve } from '$app/paths';
	import InviteQR from '$lib/components/InviteQR.svelte';

	let { data, form } = $props();
	let { group, members, sharedTagsList, myTags } = $derived(data);

	const isOwnerOrAdmin = $derived(group.role === 'owner' || group.role === 'admin');
	const isOwner = $derived(group.role === 'owner');

	let activeTab = $state<'shared' | 'members'>('shared');
	let copied = $state(false);

	function copyInviteCode() {
		if (!group.inviteCode) return;
		navigator.clipboard.writeText(group.inviteCode);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	// Mostrar errores de acciones en un banner transitorio
	let actionError = $derived(form?.error as string | undefined);

	// Confirmación de expulsión de miembro
	let pendingRemove = $state<{ userId: string; name: string } | null>(null);

	// Confirmación de salir del grupo
	let confirmLeave = $state(false);
</script>

<div class="mx-auto max-w-2xl space-y-8">
	{#if actionError}
		<p class="border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
			{actionError}
		</p>
	{/if}

	<!-- Cabecera -->
	<div>
		<a
			href={resolve('/groups')}
			class="inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink"
		>
			<ArrowLeft size={16} /> Grupos
		</a>
		<div class="mt-3 flex items-start justify-between">
			<div>
				<h1 class="font-serif text-2xl font-normal text-ink sm:text-3xl">{group.name}</h1>
				{#if group.description}
					<p class="mt-1 text-sm text-ink-faint">{group.description}</p>
				{/if}
			</div>
			<span class="mt-1 text-xs text-ink-faint">
				{group.role === 'owner' ? 'owner' : group.role === 'admin' ? 'admin' : 'member'}
			</span>
		</div>
	</div>

	<!-- Código de invitación -->
	{#if isOwnerOrAdmin}
		<div class="space-y-3 border border-paper-border px-5 py-4">
			{#if group.inviteCode}
				<div class="flex items-center gap-4">
					<div class="flex-1">
						<p class="text-xs font-medium tracking-widest text-ink-faint uppercase">
							Invitation code
						</p>
						<p class="mt-1 font-mono text-2xl font-normal tracking-[0.3em] text-ink">
							{group.inviteCode}
						</p>
					</div>
					<button
						onclick={copyInviteCode}
						class="flex items-center gap-1.5 border border-paper-border px-3 py-2 text-xs text-ink-muted hover:border-ink-faint hover:text-ink"
					>
						<Copy size={14} />
						{copied ? 'Copied!' : 'Copy'}
					</button>
					{#if isOwner}
						<form method="POST" action="?/regenerateCode" use:enhance>
							<button
								type="submit"
								title="New code"
								class="border border-paper-border p-2 text-ink-faint hover:border-ink-faint hover:text-ink"
							>
								<ArrowsClockwise size={14} />
							</button>
						</form>
					{/if}
				</div>
				<InviteQR inviteCode={group.inviteCode} />
			{:else if isOwner}
				<form method="POST" action="?/regenerateCode" use:enhance>
					<button
						type="submit"
						class="flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink"
					>
						<ArrowsClockwise size={14} /> Generate invitation code
					</button>
				</form>
			{/if}
		</div>
	{/if}

	<!-- Tabs -->
	<div class="border-b border-paper-border">
		<nav class="flex gap-6">
			{#each [{ key: 'shared', label: `Tags (${sharedTagsList.length})` }, { key: 'members', label: `Members (${members.length})` }] as tab (tab.key)}
				<button
					onclick={() => (activeTab = tab.key as 'shared' | 'members')}
					class="border-b-2 pb-3 text-sm transition-colors
					{activeTab === tab.key
						? 'border-ink font-medium text-ink'
						: 'border-transparent text-ink-faint hover:text-ink-muted'}"
				>
					{tab.label}
				</button>
			{/each}
		</nav>
	</div>

	<!-- Tab: etiquetas -->
	{#if activeTab === 'shared'}
		<div class="space-y-6">
			<!-- Mis etiquetas -->
			{#if myTags.length > 0}
				<div class="space-y-3">
					<p class="text-xs font-medium tracking-widest text-ink-faint uppercase">My tags</p>
					<div class="flex flex-wrap gap-2">
						{#each myTags as tag (tag.id)}
							<form
								method="POST"
								action={tag.alreadyShared ? '?/unshareTag' : '?/shareTag'}
								use:enhance
								class="inline"
							>
								<input type="hidden" name="tagId" value={tag.id} />
								<button
									type="submit"
									class="flex items-center gap-1.5 border px-3 py-1 text-xs transition-all
									{tag.alreadyShared
										? 'border-ink bg-ink text-paper hover:border-red-600 hover:bg-red-600'
										: 'border-dashed border-paper-border text-ink-muted hover:border-ink hover:text-ink'}"
								>
									{tag.name}
									{#if tag.alreadyShared}<span class="opacity-60">✓</span>{:else}<span
											class="opacity-40">+</span
										>{/if}
								</button>
							</form>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Todas las etiquetas del grupo -->
			{#if sharedTagsList.length === 0}
				<p class="py-8 text-center text-sm text-ink-faint">No members have shared any tags yet.</p>
			{:else}
				<div class="space-y-3">
					<p class="text-xs font-medium tracking-widest text-ink-faint uppercase">En el grupo</p>
					<ul class="divide-y divide-paper-border">
						{#each sharedTagsList as st (st.sharedTagId)}
							<li class="flex items-center gap-3 py-3">
								<span
									class="border px-3 py-0.5 text-xs"
									style={st.tagColor
										? `border-color: ${st.tagColor}44; color: ${st.tagColor}`
										: 'border-color: #e8e2da; color: #3d3d3d'}
								>
									{st.tagName}
								</span>
								<span class="text-sm text-ink-muted">{st.ownerName}</span>
								<span class="ml-auto text-xs text-ink-faint">{st.bookCount} books</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>

		<!-- Tab: miembros -->
	{:else}
		<ul class="divide-y divide-paper-border">
			{#each members as member (member.userId)}
				<li class="flex items-center gap-3 py-3">
					<div
						class="flex h-8 w-8 flex-shrink-0 items-center justify-center border border-paper-border bg-paper-ui font-serif text-sm text-ink-muted"
					>
						{member.name[0].toUpperCase()}
					</div>
					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium text-ink">{member.name}</p>
						<p class="text-xs text-ink-faint">{member.email}</p>
					</div>
					<span class="text-xs text-ink-faint">
						{member.role === 'owner' ? 'owner' : member.role === 'admin' ? 'admin' : ''}
					</span>
					{#if isOwnerOrAdmin && member.role !== 'owner'}
						<button
							type="button"
							class="text-ink-faint hover:text-red-400"
							onclick={() => (pendingRemove = { userId: member.userId, name: member.name })}
						>
							<X size={14} />
						</button>
					{/if}
				</li>
			{/each}
		</ul>

		{#if !isOwner}
			<button
				type="button"
				class="text-sm text-ink-faint hover:text-red-500"
				onclick={() => (confirmLeave = true)}
			>
				Leave this group?
			</button>
		{/if}
	{/if}
</div>

<!-- Modal: confirmar expulsión de miembro -->
{#if pendingRemove}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-ink/20">
		<div class="w-full max-w-sm border border-paper-border bg-paper p-6 shadow-sm">
			<p class="text-sm text-ink">
				Remove <span class="font-medium">{pendingRemove.name}</span> from this group?
			</p>
			<div class="mt-5 flex justify-end gap-3">
				<button
					type="button"
					class="border border-paper-border px-4 py-2 text-sm text-ink-muted hover:border-ink-faint hover:text-ink"
					onclick={() => (pendingRemove = null)}
				>
					Cancel
				</button>
				<form
					method="POST"
					action="?/removeMember"
					use:enhance={() =>
						async ({ update }) => {
							pendingRemove = null;
							await update();
							await invalidateAll();
						}}
				>
					<input type="hidden" name="userId" value={pendingRemove.userId} />
					<button
						type="submit"
						class="border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 hover:bg-red-100"
					>
						Remove
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}

<!-- Modal: confirmar salir del grupo -->
{#if confirmLeave}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-ink/20">
		<div class="w-full max-w-sm border border-paper-border bg-paper p-6 shadow-sm">
			<p class="text-sm text-ink">Leave this group? You will need a new invite code to rejoin.</p>
			<div class="mt-5 flex justify-end gap-3">
				<button
					type="button"
					class="border border-paper-border px-4 py-2 text-sm text-ink-muted hover:border-ink-faint hover:text-ink"
					onclick={() => (confirmLeave = false)}
				>
					Cancel
				</button>
				<form method="POST" action="?/leave" use:enhance>
					<button
						type="submit"
						class="border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 hover:bg-red-100"
						onclick={() => (confirmLeave = false)}
					>
						Leave
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}
