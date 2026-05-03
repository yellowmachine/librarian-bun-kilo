<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="flex min-h-screen flex-col items-center justify-center bg-paper px-5">
	<div class="w-full max-w-sm text-center">
		<p class="font-serif text-7xl font-normal text-ink-faint">{page.status}</p>
		<h1 class="mt-4 font-serif text-2xl font-normal text-ink">
			{page.status === 404 ? 'Page not found' : 'Something went wrong'}
		</h1>
		<p class="mt-2 text-sm text-ink-faint">
			{page.error?.message ?? 'An unexpected error has occurred.'}
		</p>
		<a
			href="/library"
			class="mt-8 inline-block border border-ink bg-ink px-6 py-2.5 text-sm text-paper hover:bg-ink/90"
		>
			Back to your library
		</a>
	</div>
</div>
