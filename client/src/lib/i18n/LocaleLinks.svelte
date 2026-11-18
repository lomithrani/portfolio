<!--
@component
What a page that exists in both languages says of its two addresses, in its `<head>`: the
canonical link of the language shown, one `hreflang` alternate per language (English is the
address alone, French adds `?lang=fr`: `localeAlternate`), and the Open Graph URL and locale.
Mounted once by the `(app)` layout, on the pages search engines list (the job pages, the recruiter
landing), it writes nothing on an error page; the landing page and the legal pages write their own,
with their other share tags. A portfolio is not listed: it has none (PortfolioHead.svelte).
-->
<script lang="ts">
	import { page } from '$app/state';
	import { LOCALES, getLocale } from 'portfolio-common';
	import { localeAlternate } from './urls.ts';

	const locale = getLocale();
	let canonical = $derived(localeAlternate(page.url, locale));
</script>

<!-- An error page (a job that is gone, the API out of reach) is no page of the site: no tags -->
<svelte:head>
	{#if !page.error}
		<link rel="canonical" href={canonical} />
		{#each LOCALES as language (language)}
			<link rel="alternate" hreflang={language} href={localeAlternate(page.url, language)} />
		{/each}
		<link rel="alternate" hreflang="x-default" href={localeAlternate(page.url, 'en')} />
		<meta property="og:url" content={canonical} />
		<meta property="og:locale" content={locale === 'fr' ? 'fr_FR' : 'en_GB'} />
	{/if}
</svelte:head>
