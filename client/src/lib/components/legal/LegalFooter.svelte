<!--
@component
The footer of the site's own pages (the landing page, the legal pages, the account page): the links
to the legal notice, the privacy policy, the terms of use and the cookies page, and the copyright
line. No props.
-->
<script lang="ts">
	import LegalLinks from './LegalLinks.svelte';
	import { SITE_NAME } from './legalDocuments.ts';

	const year = new Date().getFullYear();
</script>

<footer class="border-t border-surface-200-800 bg-surface-50-950 px-4 py-6 md:px-6">
	<div
		class="mx-auto flex w-full max-w-5xl flex-col gap-3 md:flex-row md:items-center md:justify-between"
	>
		<LegalLinks />
		<p class="text-sm text-surface-700-300">© {year} {SITE_NAME}</p>
	</div>
</footer>
