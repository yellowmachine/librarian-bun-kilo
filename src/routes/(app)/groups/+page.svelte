<script lang="ts">
	import { enhance } from '$app/forms';
	import { Plus, Users, ArrowRight } from 'phosphor-svelte';

	let { data, form } = $props();
	const { userGroups } = data;

	let showJoinForm = $state(false);
	let joinCode = $state('');
</script>

<div class="space-y-8">
	<div class="flex items-end justify-between">
		<div>
			<h1 class="font-serif text-3xl font-normal text-neutral-900">Grupos</h1>
			<p class="mt-1 text-sm text-neutral-400">
				{userGroups.length}
				{userGroups.length === 1 ? 'grupo' : 'grupos'}
			</p>
		</div>
		<div class="flex gap-2">
			<button
				onclick={() => (showJoinForm = !showJoinForm)}
				class="border border-neutral-200 px-4 py-2 text-sm text-neutral-600 transition-colors hover:border-neutral-900 hover:text-neutral-900"
			>
				Unirse
			</button>
			<a
				href="/groups/new"
				class="flex items-center gap-1.5 border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800"
			>
				<Plus size={16} weight="bold" /> Nuevo
			</a>
		</div>
	</div>

	<!-- Unirse con código -->
	{#if showJoinForm}
		<div class="border border-neutral-200 p-5">
			<p class="mb-3 text-xs font-medium tracking-widest text-neutral-500 uppercase">
				Código de invitación
			</p>
			<form method="POST" action="?/join" use:enhance class="flex gap-2">
				<input
					type="text"
					name="code"
					bind:value={joinCode}
					placeholder="ABC12345"
					autofocus
					maxlength="8"
					class="min-w-0 flex-1 border border-neutral-200 px-3 py-2 font-mono text-sm tracking-widest uppercase focus:border-neutral-900 focus:ring-0"
				/>
				<button
					type="submit"
					class="border border-neutral-900 bg-neutral-900 px-5 py-2 text-sm text-white hover:bg-neutral-800"
				>
					Entrar
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
			<Users size={48} weight="thin" class="mb-4 text-neutral-200" />
			<p class="text-sm text-neutral-400">Todavía no perteneces a ningún grupo.</p>
			<div class="mt-4 flex gap-4 text-sm">
				<a href="/groups/new" class="text-neutral-900 underline underline-offset-2">Crear grupo</a>
				<span class="text-neutral-200">|</span>
				<button
					onclick={() => (showJoinForm = true)}
					class="text-neutral-900 underline underline-offset-2"
				>
					Unirse con código
				</button>
			</div>
		</div>
	{:else}
		<ul class="divide-y divide-neutral-100">
			{#each userGroups as group (group.id)}
				<li>
					<a
						href="/groups/{group.id}"
						class="-mx-2 flex items-center gap-4 px-2 py-4 transition-colors hover:bg-neutral-50"
					>
						<div
							class="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-neutral-200 bg-neutral-50"
						>
							<Users size={18} weight="regular" class="text-neutral-400" />
						</div>
						<div class="min-w-0 flex-1">
							<p class="font-medium text-neutral-900">{group.name}</p>
							{#if group.description}
								<p class="truncate text-xs text-neutral-400">{group.description}</p>
							{/if}
						</div>
						<div class="flex flex-shrink-0 items-center gap-3">
							<span class="text-xs text-neutral-400">{group.memberCount}</span>
							<span
								class="text-xs text-neutral-300
								{group.role === 'owner' ? 'text-neutral-600' : ''}"
							>
								{group.role === 'owner' ? 'propietario' : group.role === 'admin' ? 'admin' : ''}
							</span>
							<ArrowRight size={16} class="text-neutral-300" />
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
