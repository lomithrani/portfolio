<!--
@component
The links to the four legal pages (legal notice, privacy policy, terms of use, cookies), in a
navigation landmark labelled "Legal". LegalFooter shows them on the site's own pages; the job pages
and the portfolios show them small at the bottom of their content.

- `compact`: smaller text and short labels ("Privacy", "Terms"), for the bottom of a page
- `lang`: the language of the labels and of the pages linked (`?lang=fr`); English by default
- `class`: extra classes of the list
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		LEGAL_DOCUMENTS,
		LEGAL_DOCUMENT_ORDER,
		withLegalLanguage,
		type LegalLanguage
	} from './legalDocuments.ts';

	let {
		compact = false,
		lang = 'en',
		class: className = ''
	}: { compact?: boolean; lang?: LegalLanguage; class?: string } = $props();

	const links = LEGAL_DOCUMENT_ORDER.map((id) => LEGAL_DOCUMENTS[id]);
</script>

<nav
	aria-label={lang === 'fr' ? 'Informations légales' : 'Legal'}
	lang={lang === 'fr' ? 'fr' : undefined}
>
	<ul
		class={[
			'flex flex-wrap items-center',
			compact ? 'gap-x-3 gap-y-1 text-xs' : 'gap-x-5 gap-y-2 text-sm',
			className
		]}
	>
		{#each links as link (link.id)}
			{@const current = page.url.pathname === link.path}
			{@const href = withLegalLanguage(resolve(link.route), lang)}
			<li>
				<!-- eslint-disable svelte/no-navigation-without-resolve -- resolve()d, with ?lang= -->
				<a
					{href}
					class="text-surface-700-300 underline-offset-4 hover:text-surface-950-50 hover:underline focus-visible:underline"
					aria-current={current ? 'page' : undefined}
					>{compact ? link.shortTitle[lang] : link.title[lang]}</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</li>
		{/each}
	</ul>
</nav>
