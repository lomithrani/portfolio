<script lang="ts">
	import LegalDocument from '#components/legal/LegalDocument.svelte';
	import PrivacyEn, { sections as enSections } from '#components/legal/content/PrivacyEn.svelte';
	import PrivacyFr, { sections as frSections } from '#components/legal/content/PrivacyFr.svelte';
	import type { PageProps } from './$types';

	// Rendered on the server; `data` comes from ../+layout.server.ts (language, publisher)
	let { data }: PageProps = $props();
</script>

<LegalDocument
	doc="privacy"
	lang={data.lang}
	sections={data.lang === 'fr' ? frSections : enSections}
>
	{#if data.lang === 'fr'}
		<PrivacyFr publisher={data.publisher} />
	{:else}
		<PrivacyEn publisher={data.publisher} />
	{/if}
</LegalDocument>
