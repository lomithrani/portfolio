<!--
@component
What every page of a portfolio says in its `<head>`, mounted once by the `[domain]` layout: a robots
meta asking search engines not to list the page (`NOINDEX` of `#lib/robots.ts`, which the server
also sends as an `x-robots-tag` header, hooks.server.ts). No canonical or `hreflang` link: a page
that asks not to be listed names no address to list instead. The preview a shared link gets is the
page's own (OpenGraph.svelte, on the experiences page and the page for recruiters): written once,
by the page that knows what it shows.
-->
<script lang="ts">
	import { NOINDEX } from '#lib/robots.ts';
</script>

<svelte:head>
	<meta name="robots" content={NOINDEX} />
</svelte:head>
