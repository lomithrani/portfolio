<script lang="ts">
	import LegalDocument from '#components/legal/LegalDocument.svelte';
	import CookiesEn, { sections as enSections } from '#components/legal/content/CookiesEn.svelte';
	import CookiesFr, { sections as frSections } from '#components/legal/content/CookiesFr.svelte';
	import type { PageProps } from './$types';

	// Rendered on the server; `data` comes from ../+layout.server.ts (language)
	let { data }: PageProps = $props();
</script>

<LegalDocument
	doc="cookies"
	lang={data.lang}
	sections={data.lang === 'fr' ? frSections : enSections}
>
	{#if data.lang === 'fr'}
		<CookiesFr />
	{:else}
		<CookiesEn />
	{/if}
</LegalDocument>
