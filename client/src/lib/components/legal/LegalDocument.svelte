<!--
@component
The page of a legal document (legal notice, privacy policy, terms of use, cookies) in English or
French: its <title>, description, canonical and hreflang alternate links, the language switch, the
"last updated" date (LEGAL_VERSION), a table of contents when the document has more than three
sections, the text (children) and links to the other documents. The whole article carries the
`lang` of its language.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import LegalDocLink from './LegalDocLink.svelte';
	import { LEGAL_VERSION } from 'portfolio-common';
	import {
		LANGUAGE_NAMES,
		LEGAL_DOCUMENTS,
		LEGAL_DOCUMENT_ORDER,
		LEGAL_LANGUAGES,
		legalLastUpdated,
		legalPageTitle,
		withLegalLanguage,
		type LegalDocumentId,
		type LegalLanguage,
		type LegalSection
	} from './legalDocuments.ts';

	let {
		doc,
		lang,
		sections,
		children
	}: {
		doc: LegalDocumentId;
		lang: LegalLanguage;
		sections: readonly LegalSection[];
		children: Snippet;
	} = $props();

	const TEXT = {
		en: {
			language: 'Language',
			lastUpdated: 'Last updated:',
			contents: 'Contents',
			others: 'Other legal documents',
			locale: 'en_GB'
		},
		fr: {
			language: 'Langue',
			lastUpdated: 'Dernière mise à jour :',
			contents: 'Sommaire',
			others: 'Autres documents légaux',
			locale: 'fr_FR'
		}
	} as const;

	let t = $derived(TEXT[lang]);
	let meta = $derived(LEGAL_DOCUMENTS[doc]);
	let path = $derived(resolve(meta.route));
	const hrefIn = (language: LegalLanguage) => withLegalLanguage(path, language);
	const absoluteIn = (language: LegalLanguage) => new URL(hrefIn(language), page.url.origin).href;
	let others = $derived(LEGAL_DOCUMENT_ORDER.filter((id) => id !== doc));
</script>

<svelte:head>
	<title>{legalPageTitle(doc, lang)}</title>
	<meta name="description" content={meta.description[lang]} />
	<link rel="canonical" href={absoluteIn(lang)} />
	{#each LEGAL_LANGUAGES as language (language)}
		<link rel="alternate" hreflang={language} href={absoluteIn(language)} />
	{/each}
	<link rel="alternate" hreflang="x-default" href={absoluteIn('en')} />
	<meta property="og:type" content="article" />
	<meta property="og:title" content={meta.title[lang]} />
	<meta property="og:description" content={meta.description[lang]} />
	<meta property="og:url" content={absoluteIn(lang)} />
	<meta property="og:locale" content={t.locale} />
</svelte:head>

<article
	{lang}
	class="mx-auto w-full max-w-3xl px-4 py-8 md:px-6 md:py-12"
	aria-labelledby="legal-title"
	data-legal-document={doc}
>
	<header class="space-y-3 border-b border-surface-200-800 pb-6">
		<nav aria-label={t.language}>
			<ul class="flex justify-end gap-1 text-sm">
				{#each LEGAL_LANGUAGES as language (language)}
					{@const current = language === lang}
					<li>
						<!-- eslint-disable svelte/no-navigation-without-resolve -- resolve()d, with ?lang= -->
						<a
							href={hrefIn(language)}
							hreflang={language}
							lang={language}
							class="btn btn-sm {current
								? 'preset-tonal-primary font-semibold'
								: 'hover:preset-tonal'}"
							aria-current={current ? 'page' : undefined}>{LANGUAGE_NAMES[language]}</a
						>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</li>
				{/each}
			</ul>
		</nav>
		<h2 id="legal-title" class="text-3xl font-bold text-balance md:text-4xl">
			{meta.title[lang]}
		</h2>
		<p class="text-sm text-surface-700-300">
			{t.lastUpdated}
			<time datetime={LEGAL_VERSION}>{legalLastUpdated(lang)}</time>
		</p>
	</header>

	{#if sections.length > 3}
		<nav
			class="card preset-outlined-surface-200-800 bg-surface-50-950 mt-6 p-4 md:p-5"
			aria-labelledby="legal-toc-title"
		>
			<h3 id="legal-toc-title" class="text-sm font-semibold tracking-wide uppercase">
				{t.contents}
			</h3>
			<ol class="mt-3 list-decimal space-y-1.5 ps-5 text-sm marker:text-surface-600-400">
				{#each sections as section (section.id)}
					<li><a class="anchor" href="#{section.id}">{section.title}</a></li>
				{/each}
			</ol>
		</nav>
	{/if}

	<div class="legal-prose mt-8">
		{@render children()}
	</div>

	<footer class="mt-12 border-t border-surface-200-800 pt-6">
		<h3 class="text-sm font-semibold">{t.others}</h3>
		<ul class="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
			{#each others as other (other)}
				<li>
					<LegalDocLink doc={other} {lang} />
				</li>
			{/each}
		</ul>
	</footer>
</article>

<style>
	/* Readable long text without a typography plugin: the content components write plain
	   headings, paragraphs, lists and tables */
	.legal-prose {
		line-height: 1.7;
		overflow-wrap: break-word;
	}

	.legal-prose :global(h3) {
		margin-top: 2.5rem;
		margin-bottom: 0.75rem;
		font-size: 1.375rem;
		line-height: 1.3;
		font-weight: 700;
		scroll-margin-top: 1.5rem;
	}

	.legal-prose :global(h3:first-child) {
		margin-top: 0;
	}

	.legal-prose :global(h4) {
		margin-top: 1.75rem;
		margin-bottom: 0.5rem;
		font-size: 1.0625rem;
		font-weight: 650;
		scroll-margin-top: 1.5rem;
	}

	.legal-prose :global(p),
	.legal-prose :global(ul),
	.legal-prose :global(ol),
	.legal-prose :global(dl),
	.legal-prose :global(.legal-table) {
		margin-block: 0.875rem;
	}

	.legal-prose :global(ul) {
		list-style: disc;
		padding-inline-start: 1.25rem;
	}

	.legal-prose :global(ol) {
		list-style: decimal;
		padding-inline-start: 1.25rem;
	}

	.legal-prose :global(li + li) {
		margin-top: 0.375rem;
	}

	.legal-prose :global(strong) {
		font-weight: 650;
	}

	.legal-prose :global(code) {
		font-size: 0.875em;
		padding: 0.1em 0.35em;
		border-radius: 0.25rem;
		background: var(--color-surface-200);
		overflow-wrap: anywhere;
	}

	:global(.dark) .legal-prose :global(code) {
		background: var(--color-surface-800);
	}

	.legal-prose :global(.legal-details) {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.125rem 1.5rem;
	}

	.legal-prose :global(.legal-details dt) {
		font-weight: 650;
		margin-top: 0.5rem;
	}

	@media (min-width: 640px) {
		.legal-prose :global(.legal-details) {
			grid-template-columns: 14rem minmax(0, 1fr);
		}

		.legal-prose :global(.legal-details dt) {
			margin-top: 0;
		}
	}

	/* Tables scroll sideways inside their wrapper on small screens, never the page */
	.legal-prose :global(.legal-table) {
		overflow-x: auto;
		border: 1px solid var(--color-surface-200);
		border-radius: 0.5rem;
	}

	:global(.dark) .legal-prose :global(.legal-table) {
		border-color: var(--color-surface-800);
	}

	.legal-prose :global(.legal-table table) {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
		line-height: 1.5;
	}

	/* Tables of three columns or more keep readable columns and scroll instead */
	.legal-prose :global(.legal-table-wide table) {
		min-width: 36rem;
	}

	.legal-prose :global(.legal-table th),
	.legal-prose :global(.legal-table td) {
		padding: 0.5rem 0.75rem;
		text-align: start;
		vertical-align: top;
		border-top: 1px solid var(--color-surface-200);
	}

	:global(.dark) .legal-prose :global(.legal-table th),
	:global(.dark) .legal-prose :global(.legal-table td) {
		border-color: var(--color-surface-800);
	}

	.legal-prose :global(.legal-table thead th) {
		border-top: none;
		font-weight: 650;
		background: var(--color-surface-100);
	}

	:global(.dark) .legal-prose :global(.legal-table thead th) {
		background: var(--color-surface-900);
	}

	.legal-prose :global(.legal-callout) {
		margin-block: 1rem;
		padding: 1rem 1.25rem;
		border-radius: 0.5rem;
		border-inline-start: 4px solid var(--color-primary-500);
		background: var(--color-surface-100);
	}

	:global(.dark) .legal-prose :global(.legal-callout) {
		background: var(--color-surface-900);
	}

	.legal-prose :global(.legal-callout > :first-child) {
		margin-top: 0;
	}

	.legal-prose :global(.legal-callout > :last-child) {
		margin-bottom: 0;
	}
</style>
