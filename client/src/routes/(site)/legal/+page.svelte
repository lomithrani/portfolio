<script lang="ts">
	import { getLocale } from 'portfolio-common';
	import LegalDocument from '#components/legal/LegalDocument.svelte';
	import LegalNoticeEn, {
		sections as enSections
	} from '#components/legal/content/LegalNoticeEn.svelte';
	import LegalNoticeFr, {
		sections as frSections
	} from '#components/legal/content/LegalNoticeFr.svelte';
	import type { PageProps } from './$types';

	// Rendered on the server, in the page's language: the one it was loaded in, like its header and
	// footer (a navigation inside the site never changes it). `data` comes from ./+layout.server.ts
	// (the publisher's details)
	let { data }: PageProps = $props();
	const lang = getLocale();
</script>

<LegalDocument doc="notice" {lang} sections={lang === 'fr' ? frSections : enSections}>
	{#if lang === 'fr'}
		<LegalNoticeFr publisher={data.publisher} />
	{:else}
		<LegalNoticeEn publisher={data.publisher} />
	{/if}
</LegalDocument>
