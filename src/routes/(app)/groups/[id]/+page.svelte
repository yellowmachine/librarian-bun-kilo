<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { ArrowLeft, Copy, ArrowsClockwise, X, PencilSimple } from 'phosphor-svelte';
	import InviteQR from '$lib/components/InviteQR.svelte';
	import { itemCountLabel } from '$lib/itemCounts';
	import { tagChipStyle } from '$lib/tagColor';

	let { data, form } = $props();
	let { group, members, sharedTagsList, myTags, sharedTotals } = $derived(data);

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

	// Editar nombre y descripción (owner o admin), en la propia cabecera
	let editing = $state(false);
	let saving = $state(false);
	const renameError = $derived(form?.renameError as string | undefined);

	// Confirmación de expulsión de miembro
	let pendingRemove = $state<{ userId: string; name: string } | null>(null);

	// Confirmación de salir del grupo
	let confirmLeave = $state(false);

	// Borrar el grupo (solo owner). Con más miembros, hay que escribir el nombre.
	let confirmDelete = $state(false);
	let deleteName = $state('');
	let deleting = $state(false);
	const otherMembers = $derived(members.length - 1);
	const deleteReady = $derived(otherMembers === 0 || deleteName.trim() === group.name);
	const sharedLabel = $derived(itemCountLabel(sharedTotals.books, sharedTotals.movies));
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
			href="/groups"
			class="inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink"
		>
			<ArrowLeft size={16} /> Grupos
		</a>
		{#if editing}
			<form
				method="POST"
				action="?/rename"
				class="mt-3 space-y-4"
				use:enhance={() => {
					saving = true;
					return async ({ result, update }) => {
						await update({ reset: false });
						saving = false;
						if (result.type === 'success') editing = false;
					};
				}}
			>
				<div>
					<label
						for="group-name"
						class="block text-xs font-medium tracking-widest text-ink-muted uppercase"
					>
						Group name
					</label>
					<input
						id="group-name"
						name="name"
						type="text"
						required
						maxlength="60"
						value={group.name}
						class="mt-1.5 block w-full border-0 border-b border-field bg-transparent px-0 py-2 font-serif text-xl text-ink focus:border-brown-600 focus:ring-0"
					/>
				</div>
				<div>
					<label
						for="group-description"
						class="block text-xs font-medium tracking-widest text-ink-muted uppercase"
					>
						Description <span class="tracking-normal text-ink-faint normal-case">(optional)</span>
					</label>
					<textarea
						id="group-description"
						name="description"
						rows="2"
						value={group.description ?? ''}
						class="mt-1.5 w-full border-0 border-b border-field bg-transparent px-0 py-2 text-sm text-ink focus:border-brown-600 focus:ring-0"
					></textarea>
				</div>
				{#if renameError}
					<p class="text-sm text-red-700" role="alert">{renameError}</p>
				{/if}
				<div class="flex gap-3">
					<button
						type="submit"
						disabled={saving}
						class="border btn-primary px-4 py-2 text-sm disabled:opacity-50"
					>
						{saving ? 'Saving…' : 'Save'}
					</button>
					<button
						type="button"
						class="border btn-secondary px-4 py-2 text-sm"
						onclick={() => (editing = false)}
					>
						Cancel
					</button>
				</div>
			</form>
		{:else}
			<div class="mt-3 flex items-start justify-between gap-4">
				<div class="min-w-0">
					<h1 class="font-serif text-2xl font-normal text-ink sm:text-3xl">{group.name}</h1>
					{#if group.description}
						<p class="mt-1 text-sm text-ink-faint">{group.description}</p>
					{/if}
				</div>
				<div class="mt-1 flex shrink-0 items-center gap-3">
					{#if isOwnerOrAdmin}
						<button
							type="button"
							onclick={() => (editing = true)}
							class="flex items-center gap-1 text-xs action-text"
						>
							<PencilSimple size={12} /> Edit
						</button>
					{/if}
					<span class="text-xs text-ink-faint">
						{group.role === 'owner' ? 'owner' : group.role === 'admin' ? 'admin' : 'member'}
					</span>
				</div>
			</div>
		{/if}
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
						class="flex items-center gap-1.5 border btn-secondary px-3 py-2 text-xs"
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
					<button type="submit" class="flex items-center gap-1.5 text-sm action-text">
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
						? 'border-brown-700 font-medium text-ink'
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
					<p class="text-xs text-ink-faint">
						Sharing a tag shows the group every book and movie that carries it.
					</p>
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
										? 'border-brown-700 bg-brown-700 text-brown-50 hover:border-red-600 hover:bg-red-600'
										: 'border-dashed border-paper-border text-ink-muted hover:border-ink hover:text-ink'}"
								>
									{tag.name}
									{#if tag.bookCount + tag.movieCount > 0}
										<span class="opacity-60 hc:opacity-100"
											>· {itemCountLabel(tag.bookCount, tag.movieCount)}</span
										>
									{/if}
									{#if tag.alreadyShared}<span class="opacity-60 hc:opacity-100">✓</span
										>{:else}<span class="opacity-40 hc:opacity-100">+</span>{/if}
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
					<p class="text-xs font-medium tracking-widest text-ink-faint uppercase">In the group</p>
					<ul class="divide-y divide-paper-border">
						{#each sharedTagsList as st (st.sharedTagId)}
							<li class="flex items-center gap-3 py-3">
								<span class="border tag-chip px-3 py-0.5 text-xs" style={tagChipStyle(st.tagColor)}>
									{st.tagName}
								</span>
								<span class="text-sm text-ink-muted">{st.ownerName}</span>
								<span class="ml-auto text-xs text-ink-faint">
									{itemCountLabel(st.bookCount, st.movieCount) || 'Nothing yet'}
								</span>
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
							class="text-ink-faint hover:text-red-700"
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
				class="text-sm text-ink-faint hover:text-red-700"
				onclick={() => (confirmLeave = true)}
			>
				Leave this group?
			</button>
		{/if}
	{/if}

	<!-- Borrar el grupo (owner): no puede salir, así que es su manera de acabar con él -->
	{#if isOwner}
		<div class="flex items-center justify-between gap-4 border-t border-paper-border pt-6">
			<p class="text-xs text-ink-faint">
				Deleting the group removes it for everyone. Nobody loses any book, movie or tag.
			</p>
			<button
				type="button"
				class="shrink-0 border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
				onclick={() => {
					deleteName = '';
					confirmDelete = true;
				}}
			>
				Delete group
			</button>
		</div>
	{/if}
</div>

<!-- Modal: confirmar borrado del grupo -->
{#if confirmDelete}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4">
		<div
			class="w-full max-w-sm space-y-4 border border-paper-border bg-paper p-6 shadow-sm"
			role="dialog"
			aria-modal="true"
			aria-labelledby="delete-group-title"
		>
			<p id="delete-group-title" class="text-sm font-medium text-ink">
				Delete «{group.name}»?
			</p>
			<ul class="list-disc space-y-1 pl-5 text-sm text-ink-muted">
				{#if otherMembers > 0}
					<li>
						{otherMembers}
						{otherMembers === 1 ? 'member loses' : 'members lose'} access to the group{sharedLabel
							? ` and to the ${sharedLabel} shared in it`
							: ''}.
					</li>
				{:else if sharedLabel}
					<li>The {sharedLabel} you shared here stop being shared with it.</li>
				{/if}
				<li>The invitation code stops working.</li>
				<li>Books, movies, tags and loans stay with their owners.</li>
				<li>This cannot be undone.</li>
			</ul>

			<form
				method="POST"
				action="?/deleteGroup"
				class="space-y-4"
				use:enhance={() => {
					deleting = true;
					return async ({ update }) => {
						await update();
						deleting = false;
						confirmDelete = false;
					};
				}}
			>
				{#if otherMembers > 0}
					<div>
						<label for="confirmName" class="block text-xs text-ink-muted">
							Type <span class="font-medium text-ink">{group.name}</span> to confirm
						</label>
						<input
							id="confirmName"
							name="confirmName"
							bind:value={deleteName}
							autocomplete="off"
							class="mt-1.5 w-full border border-field bg-paper px-3 py-2 text-sm text-ink focus:border-brown-600 focus:ring-0"
						/>
					</div>
				{/if}
				<div class="flex justify-end gap-3">
					<button
						type="button"
						class="border btn-secondary px-4 py-2 text-sm"
						onclick={() => (confirmDelete = false)}
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={!deleteReady || deleting}
						class="border border-red-600 bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
					>
						{deleting ? 'Deleting…' : 'Delete group'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

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
					class="border btn-secondary px-4 py-2 text-sm"
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
					class="border btn-secondary px-4 py-2 text-sm"
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
