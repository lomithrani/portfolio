<script lang="ts">
	import LegalDocument from '#components/legal/LegalDocument.svelte';
	import LegalNoticeEn, {
		sections as enSections
	} from '#components/legal/content/LegalNoticeEn.svelte';
	import LegalNoticeFr, {
		sections as frSections
	} from '#components/legal/content/LegalNoticeFr.svelte';
	import type { PageProps } from './$types';

	// Rendered on the server; `data` comes from ./+layout.server.ts (language, publisher)
	let { data }: PageProps = $props();
</script>

<LegalDocument
	doc="notice"
	lang={data.lang}
	sections={data.lang === 'fr' ? frSections : enSections}
>
	{#if data.lang === 'fr'}
		<LegalNoticeFr publisher={data.publisher} />
	{:else}
		<LegalNoticeEn publisher={data.publisher} />
	{/if}
</LegalDocument>
