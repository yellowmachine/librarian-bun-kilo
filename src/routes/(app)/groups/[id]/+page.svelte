<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		ArrowLeft,
		Tag,
		Users,
		Copy,
		ArrowsClockwise,
		MagnifyingGlass,
		X
	} from 'phosphor-svelte';
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
</script>

<div class="mx-auto max-w-2xl space-y-8">
	<!-- Cabecera -->
	<div>
		<a
			href="/groups"
			class="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-900"
		>
			<ArrowLeft size={16} /> Grupos
		</a>
		<div class="mt-3 flex items-start justify-between">
			<div>
				<h1 class="font-serif text-3xl font-normal text-neutral-900">{group.name}</h1>
				{#if group.description}
					<p class="mt-1 text-sm text-neutral-400">{group.description}</p>
				{/if}
			</div>
			<span class="mt-1 text-xs text-neutral-400">
				{group.role === 'owner' ? 'propietario' : group.role === 'admin' ? 'admin' : 'miembro'}
			</span>
		</div>
	</div>

	<!-- Código de invitación -->
	{#if isOwnerOrAdmin && group.inviteCode}
		<div class="space-y-3 border border-neutral-200 px-5 py-4">
			<div class="flex items-center gap-4">
				<div class="flex-1">
					<p class="text-xs font-medium tracking-widest text-neutral-400 uppercase">
						Código de invitación
					</p>
					<p class="mt-1 font-mono text-2xl font-normal tracking-[0.3em] text-neutral-900">
						{group.inviteCode}
					</p>
				</div>
				<button
					onclick={copyInviteCode}
					class="flex items-center gap-1.5 border border-neutral-200 px-3 py-2 text-xs text-neutral-500 hover:border-neutral-400 hover:text-neutral-900"
				>
					<Copy size={14} />
					{copied ? '¡Copiado!' : 'Copiar'}
				</button>
				{#if isOwner}
					<form method="POST" action="?/regenerateCode" use:enhance>
						<button
							type="submit"
							title="Nuevo código"
							class="border border-neutral-200 p-2 text-neutral-400 hover:border-neutral-400 hover:text-neutral-900"
						>
							<ArrowsClockwise size={14} />
						</button>
					</form>
				{/if}
			</div>
			<InviteQR inviteCode={group.inviteCode} />
		</div>
	{/if}

	<!-- Acceso rápido búsqueda -->
	<a
		href="/groups/{group.id}/search"
		class="flex items-center gap-3 border border-neutral-200 px-5 py-4 transition-colors hover:border-neutral-900"
	>
		<MagnifyingGlass size={20} weight="light" class="text-neutral-400" />
		<span class="text-sm text-neutral-700">Buscar libros en este grupo</span>
		<span class="ml-auto text-neutral-300">→</span>
	</a>

	<!-- Tabs -->
	<div class="border-b border-neutral-100">
		<nav class="flex gap-6">
			{#each [{ key: 'shared', label: `Etiquetas (${sharedTagsList.length})` }, { key: 'members', label: `Miembros (${members.length})` }] as tab}
				<button
					onclick={() => (activeTab = tab.key as 'shared' | 'members')}
					class="border-b-2 pb-3 text-sm transition-colors
					{activeTab === tab.key
						? 'border-neutral-900 font-medium text-neutral-900'
						: 'border-transparent text-neutral-400 hover:text-neutral-700'}"
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
					<p class="text-xs font-medium tracking-widest text-neutral-400 uppercase">
						Mis etiquetas
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
										? 'border-neutral-900 bg-neutral-900 text-white hover:border-red-600 hover:bg-red-600'
										: 'border-dashed border-neutral-300 text-neutral-500 hover:border-neutral-900 hover:text-neutral-900'}"
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
				<p class="py-8 text-center text-sm text-neutral-300">
					Ningún miembro ha compartido etiquetas todavía.
				</p>
			{:else}
				<div class="space-y-3">
					<p class="text-xs font-medium tracking-widest text-neutral-400 uppercase">En el grupo</p>
					<ul class="divide-y divide-neutral-100">
						{#each sharedTagsList as st (st.sharedTagId)}
							<li class="flex items-center gap-3 py-3">
								<span
									class="border px-3 py-0.5 text-xs"
									style={st.tagColor
										? `border-color: ${st.tagColor}44; color: ${st.tagColor}`
										: 'border-color: #e5e5e5; color: #3d3d3d'}
								>
									{st.tagName}
								</span>
								<span class="text-sm text-neutral-600">{st.ownerName}</span>
								<span class="ml-auto text-xs text-neutral-300">{st.bookCount} libros</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>

		<!-- Tab: miembros -->
	{:else}
		<ul class="divide-y divide-neutral-100">
			{#each members as member (member.userId)}
				<li class="flex items-center gap-3 py-3">
					<div
						class="flex h-8 w-8 flex-shrink-0 items-center justify-center border border-neutral-200 bg-neutral-50 font-serif text-sm text-neutral-500"
					>
						{member.name[0].toUpperCase()}
					</div>
					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium text-neutral-900">{member.name}</p>
						<p class="text-xs text-neutral-400">{member.email}</p>
					</div>
					<span class="text-xs text-neutral-400">
						{member.role === 'owner' ? 'propietario' : member.role === 'admin' ? 'admin' : ''}
					</span>
					{#if isOwnerOrAdmin && member.role !== 'owner'}
						<form method="POST" action="?/removeMember" use:enhance class="inline">
							<input type="hidden" name="userId" value={member.userId} />
							<button
								type="submit"
								class="text-neutral-200 hover:text-red-400"
								onclick={(e) => {
									if (!confirm(`¿Expulsar a ${member.name}?`)) e.preventDefault();
								}}
							>
								<X size={14} />
							</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>

		{#if !isOwner}
			<form
				method="POST"
				action="?/leave"
				use:enhance
				onsubmit={(e) => {
					if (!confirm('¿Salir de este grupo?')) e.preventDefault();
				}}
			>
				<button type="submit" class="text-sm text-neutral-300 hover:text-red-500"
					>Salir del grupo</button
				>
			</form>
		{/if}
	{/if}
</div>
