<!--
@component
The publisher's contact address (LEGAL_CONTACT_EMAIL) as a mailto link, with an optional subject
(e.g. "Report"). Until it is configured, a notice says so: never a made-up address.
-->
<script lang="ts">
	import { mailtoHref, type LegalLanguage, type LegalPublisher } from './legalDocuments.ts';

	let {
		publisher,
		lang,
		subject
	}: { publisher: LegalPublisher; lang: LegalLanguage; subject?: string } = $props();
</script>

{#if publisher.email}
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- a mailto: link -->
	<a class="link-text break-all" href={mailtoHref(publisher.email, subject)}>{publisher.email}</a>
{:else}
	<em data-testid="legal-not-configured"
		>{lang === 'fr'
			? '(adresse de contact pas encore configurée)'
			: '(contact address not configured yet)'}</em
	>
{/if}
