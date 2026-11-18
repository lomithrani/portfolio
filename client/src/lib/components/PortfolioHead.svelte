<!--
@component
What a portfolio's pages say in their `<head>`, mounted once by the `[domain]` layout: a robots
meta asking search engines not to list the page (`NOINDEX` of `#lib/robots.ts`, which the server
also sends as an `x-robots-tag` header, hooks.server.ts), and the Open Graph URL and locale of
the page shown, for the preview a shared link gets. No canonical or `hreflang` link: a page that
asks not to be listed names no address to list instead.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { getLocale } from 'portfolio-common';
	import { localeAlternate } from '#lib/i18n/urls.ts';
	import { NOINDEX } from '#lib/robots.ts';

	const locale = getLocale();
	let url = $derived(localeAlternate(page.url, locale));
</script>

<svelte:head>
	<meta name="robots" content={NOINDEX} />
	<!-- An error page is no page of the portfolio: nothing to preview -->
	{#if !page.error}
		<meta property="og:url" content={url} />
		<meta property="og:locale" content={locale === 'fr' ? 'fr_FR' : 'en_GB'} />
	{/if}
</svelte:head>
