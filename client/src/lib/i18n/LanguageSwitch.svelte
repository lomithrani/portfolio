<!--
@component
The link to the site's other language ("Français" on an English page, "English" on a French
one): this page again with `?lang=`, loaded from the server, which saves the choice in the
`lang` cookie and renders in that language (hooks.server.ts). A plain link: it works before the
page hydrates and without JavaScript. One per page, like the light/dark switch.

- `iconOnly`: the globe alone, the language's name as its accessible name (the portfolio's rail)
- `class`: extra classes of the link
-->
<script lang="ts">
	import { page } from '$app/state';
	import { GlobeAlt } from 'svelte-heros-v2';
	import { LOCALES, LOCALE_NAMES, getLocale } from 'portfolio-common';
	import { localeHref } from './urls.ts';

	let { iconOnly = false, class: className = '' }: { iconOnly?: boolean; class?: string } =
		$props();

	const current = getLocale();
	const other = LOCALES.find((locale) => locale !== current) ?? current;
	// page.url is the last real navigation's: a shallow one (the experiences page's filters and
	// view, kept in the URL with replaceState) only shows in page.shallow
	let href = $derived(localeHref(page.shallow?.url ?? page.url, other));
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- this page's own URL, with ?lang= -->
<a
	{href}
	hreflang={other}
	lang={other}
	data-sveltekit-reload
	data-language-switch={other}
	aria-label={iconOnly ? LOCALE_NAMES[other] : undefined}
	title={iconOnly ? LOCALE_NAMES[other] : undefined}
	class={[
		'inline-flex min-h-9 items-center gap-1.5 rounded-base px-2 text-sm font-medium text-surface-700-300 hover:text-surface-950-50 hover:preset-tonal',
		className
	]}
>
	<GlobeAlt size="18" class="shrink-0" aria-hidden="true" />
	{#if !iconOnly}{LOCALE_NAMES[other]}{/if}
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
