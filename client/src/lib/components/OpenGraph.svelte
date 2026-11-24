<!--
@component
The preview a shared link gets (LinkedIn, Slack, messaging apps), in the page's `<head>`: every
Open Graph tag, `twitter:card` and `twitter:image:alt`, written once. Mounted by the pages of a
portfolio a visitor is sent to, the experiences page and the page for recruiters, with what they
show anyone: a title, a description, and a generic picture of Portfolio in the page's language
(`previewImage` of `#services/linkPreview.ts`). Not listed by search engines all the same:
PortfolioHead.svelte writes their robots meta, and they name no canonical or `hreflang` address.
`og:url` is the page's address without its states (`?view=`, `?job=`...), with `?lang=fr` in
French, as the language switch would give it.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { getLocale } from 'portfolio-common';
	import { localeAlternate, ogLocale } from '#lib/i18n/urls.ts';
	import { previewImage, type PreviewImageKind } from '#services/linkPreview.ts';

	let {
		title,
		description,
		image
	}: {
		/** The preview's title: the portfolio's name, or the page's title */
		title: string;
		description: string;
		/** Which picture: the portfolio's or its page for recruiters' */
		image: PreviewImageKind;
	} = $props();

	const locale = getLocale();
	let url = $derived(localeAlternate(page.url, locale));
	let picture = $derived(previewImage(image, page.url.origin));
</script>

<svelte:head>
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Portfolio" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={url} />
	<meta property="og:locale" content={ogLocale(locale)} />
	<meta property="og:image" content={picture.url} />
	<meta property="og:image:width" content={String(picture.width)} />
	<meta property="og:image:height" content={String(picture.height)} />
	<meta property="og:image:alt" content={picture.alt} />
	<meta name="twitter:card" content="summary_large_image" />
	<!-- X reads the picture from og:image, but its alternative text only from here -->
	<meta name="twitter:image:alt" content={picture.alt} />
</svelte:head>
