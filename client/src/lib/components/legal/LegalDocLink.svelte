<!--
@component
A link to one of the legal pages. Its text is the document's title, in the language of the
document it appears in (`lang`), unless children are given. The page linked opens in the
site's language, which is that document's.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import { LEGAL_DOCUMENTS, type LegalDocumentId, type LegalLanguage } from './legalDocuments.ts';

	let {
		doc,
		lang,
		hash,
		children
	}: { doc: LegalDocumentId; lang: LegalLanguage; hash?: string; children?: Snippet } = $props();

	let meta = $derived(LEGAL_DOCUMENTS[doc]);
	let href = $derived(`${resolve(meta.route)}${hash ? `#${hash}` : ''}`);
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve()d, with #hash -->
<a class="link-text" {href}
	>{#if children}{@render children()}{:else}{meta.title[lang]}{/if}</a
>
