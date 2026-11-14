<script lang="ts">
	import LegalDocument from '#components/legal/LegalDocument.svelte';
	import TermsEn, { sections as enSections } from '#components/legal/content/TermsEn.svelte';
	import TermsFr, { sections as frSections } from '#components/legal/content/TermsFr.svelte';
	import type { PageProps } from './$types';

	// Rendered on the server; `data` comes from ../+layout.server.ts (language, publisher)
	let { data }: PageProps = $props();
</script>

<LegalDocument doc="terms" lang={data.lang} sections={data.lang === 'fr' ? frSections : enSections}>
	{#if data.lang === 'fr'}
		<TermsFr publisher={data.publisher} />
	{:else}
		<TermsEn publisher={data.publisher} />
	{/if}
</LegalDocument>
