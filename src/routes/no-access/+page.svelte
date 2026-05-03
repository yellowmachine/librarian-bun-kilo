<script lang="ts">
	import { enhance } from '$app/forms';
	let { data } = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-paper px-5">
	<div class="w-full max-w-sm text-center">
		<h1 class="font-serif text-4xl font-normal tracking-tight text-ink">librarian</h1>
		<p class="mt-2 text-sm text-ink-faint">Tu biblioteca particular</p>

		<div class="mt-10">
			<p class="text-sm font-medium text-ink">No access to Librarian</p>
			<p class="mt-3 text-sm text-ink-muted">
				{#if data.user}
					Your account (<span class="text-ink">{data.user.email}</span>) is registered in Scholio
					but does not have access to Librarian yet.
				{:else}
					Your account does not have access to Librarian yet.
				{/if}
			</p>
		</div>

		<div class="mt-8 flex flex-col gap-3">
			<form method="POST" action="?/logout" use:enhance>
				<button type="submit" class="w-full px-4 py-2.5 text-sm text-ink-faint hover:text-ink">
					Close session
				</button>
			</form>
		</div>
	</div>
</div>
