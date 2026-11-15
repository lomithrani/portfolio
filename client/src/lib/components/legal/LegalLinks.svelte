<!--
@component
The links to the four legal pages (legal notice, privacy policy, terms of use, cookies), in a
navigation landmark labelled "Legal". LegalFooter shows them on the site's own pages; the job pages
and the portfolios show them small at the bottom of their content.

- `compact`: smaller text and short labels ("Privacy", "Terms"), for the bottom of a page
- `class`: extra classes of the list
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getLocale } from 'portfolio-common';
	import { LEGAL_DOCUMENTS, LEGAL_DOCUMENT_ORDER } from './legalDocuments.ts';
	import { m } from './legal.messages.ts';

	let { compact = false, class: className = '' }: { compact?: boolean; class?: string } = $props();

	const lang = getLocale();

	const links = LEGAL_DOCUMENT_ORDER.map((id) => LEGAL_DOCUMENTS[id]);
</script>

<nav aria-label={m.links.label}>
	<ul
		class={[
			'flex flex-wrap items-center',
			compact ? 'gap-x-3 gap-y-1 text-xs' : 'gap-x-5 gap-y-2 text-sm',
			className
		]}
	>
		{#each links as link (link.id)}
			{@const current = page.url.pathname === link.path}
			<li>
				<a
					href={resolve(link.route)}
					class="text-surface-700-300 underline-offset-4 hover:text-surface-950-50 hover:underline focus-visible:underline"
					aria-current={current ? 'page' : undefined}
					>{compact ? link.shortTitle[lang] : link.title[lang]}</a
				>
			</li>
		{/each}
	</ul>
</nav>
