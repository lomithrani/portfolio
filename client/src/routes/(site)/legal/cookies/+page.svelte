<script lang="ts">
	import { getLocale } from 'portfolio-common';
	import LegalDocument from '#components/legal/LegalDocument.svelte';
	import CookiesEn, { sections as enSections } from '#components/legal/content/CookiesEn.svelte';
	import CookiesFr, { sections as frSections } from '#components/legal/content/CookiesFr.svelte';

	// Rendered on the server, in the page's language: the one it was loaded in, like its header and
	// footer (a navigation inside the site never changes it)
	const lang = getLocale();
</script>

<LegalDocument doc="cookies" {lang} sections={lang === 'fr' ? frSections : enSections}>
	{#if lang === 'fr'}
		<CookiesFr />
	{:else}
		<CookiesEn />
	{/if}
</LegalDocument>
