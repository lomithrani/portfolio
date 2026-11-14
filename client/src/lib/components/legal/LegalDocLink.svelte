<!--
@component
A link to one of the legal pages, in the language of the page it appears on (`?lang=fr` for
French). Its text is the document's title unless children are given.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import {
		LEGAL_DOCUMENTS,
		withLegalLanguage,
		type LegalDocumentId,
		type LegalLanguage
	} from './legalDocuments.ts';

	let {
		doc,
		lang,
		hash,
		children
	}: { doc: LegalDocumentId; lang: LegalLanguage; hash?: string; children?: Snippet } = $props();

	let meta = $derived(LEGAL_DOCUMENTS[doc]);
	let href = $derived(`${withLegalLanguage(resolve(meta.route), lang)}${hash ? `#${hash}` : ''}`);
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve()d, with ?lang= and #hash -->
<a class="anchor" {href}
	>{#if children}{@render children()}{:else}{meta.title[lang]}{/if}</a
>
