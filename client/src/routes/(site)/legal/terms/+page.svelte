<script lang="ts">
	import { getLocale } from 'portfolio-common';
	import LegalDocument from '#components/legal/LegalDocument.svelte';
	import TermsEn, { sections as enSections } from '#components/legal/content/TermsEn.svelte';
	import TermsFr, { sections as frSections } from '#components/legal/content/TermsFr.svelte';
	import type { PageProps } from './$types';

	// Rendered on the server, in the page's language: the one it was loaded in, like its header and
	// footer (a navigation inside the site never changes it). `data` comes from ../+layout.server.ts
	// (the publisher's details)
	let { data }: PageProps = $props();
	const lang = getLocale();
</script>

<LegalDocument doc="terms" {lang} sections={lang === 'fr' ? frSections : enSections}>
	{#if lang === 'fr'}
		<TermsFr publisher={data.publisher} />
	{:else}
		<TermsEn publisher={data.publisher} />
	{/if}
</LegalDocument>
