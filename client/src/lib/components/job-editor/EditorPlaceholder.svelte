<!--
@component
What the job editor's pages show while the session is checked or the posting loads: the shape of
the form, without content (no flash of a signed-out page).
-->
<div class="space-y-6" aria-busy="true">
	<p class="sr-only" role="status">Loading…</p>
	<div class="space-y-2" aria-hidden="true">
		<div class="placeholder h-8 w-2/3 animate-pulse motion-reduce:animate-none"></div>
		<div class="placeholder h-4 w-1/2 animate-pulse motion-reduce:animate-none"></div>
	</div>
	{#each [0, 1] as section (section)}
		<div
			class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-4 p-4 sm:p-6"
			aria-hidden="true"
		>
			<div class="placeholder h-5 w-32 animate-pulse motion-reduce:animate-none"></div>
			<div class="placeholder h-10 w-full animate-pulse motion-reduce:animate-none"></div>
			<div class="placeholder h-10 w-full animate-pulse motion-reduce:animate-none"></div>
		</div>
	{/each}
</div>
