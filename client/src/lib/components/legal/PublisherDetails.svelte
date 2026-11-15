<!--
@component
The publisher's identity as the web service's LEGAL_* variables give it: name, status, address,
contact email, phone, company and VAT numbers (only what is configured). Until the name and the
contact email are set, a notice says "Publisher details are not configured yet." in their place:
the pages never show a made-up identity.

- `variant`: `notice` (legal notice: status, numbers, director of publication) or `controller`
  (privacy policy: who is responsible for the data and how to reach them)
-->
<script lang="ts">
	import ContactEmail from './ContactEmail.svelte';
	import type { LegalLanguage, LegalPublisher } from './legalDocuments.ts';

	let {
		publisher,
		lang,
		variant = 'notice'
	}: {
		publisher: LegalPublisher;
		lang: LegalLanguage;
		variant?: 'notice' | 'controller';
	} = $props();

	const TEXT = {
		en: {
			notConfigured: 'Publisher details are not configured yet.',
			notConfiguredHelp: 'The operator of this site has not entered them yet.',
			name: 'Name',
			status: 'Status',
			individual: 'Individual acting on a non-professional basis',
			professional: 'Professional',
			address: 'Address',
			email: 'Email',
			phone: 'Phone',
			siren: 'SIREN / SIRET',
			vat: 'VAT number',
			director: 'Director of publication'
		},
		fr: {
			notConfigured: "Les informations sur l'éditeur ne sont pas encore configurées.",
			notConfiguredHelp: "L'exploitant de ce site ne les a pas encore renseignées.",
			name: 'Nom',
			status: 'Statut',
			individual: 'Particulier agissant à titre non professionnel',
			professional: 'Professionnel',
			address: 'Adresse',
			email: 'E-mail',
			phone: 'Téléphone',
			siren: 'SIREN / SIRET',
			vat: 'Numéro de TVA intracommunautaire',
			director: 'Directeur de la publication'
		}
	} as const;

	let t = $derived(TEXT[lang]);
</script>

{#if !publisher.configured}
	<div
		class="card preset-tonal-warning space-y-1 p-4"
		role="note"
		data-testid="legal-not-configured"
	>
		<p class="font-semibold">{t.notConfigured}</p>
		<p class="text-sm">{t.notConfiguredHelp}</p>
	</div>
{/if}
{#if publisher.name || publisher.email}
	<dl class="legal-details">
		{#if publisher.name}
			<dt>{t.name}</dt>
			<dd>{publisher.name}</dd>
		{/if}
		{#if variant === 'notice'}
			<dt>{t.status}</dt>
			<dd>{publisher.siren ? t.professional : t.individual}</dd>
		{/if}
		{#if publisher.address}
			<dt>{t.address}</dt>
			<dd>{publisher.address}</dd>
		{/if}
		<dt>{t.email}</dt>
		<dd><ContactEmail {publisher} {lang} /></dd>
		{#if publisher.phone}
			<dt>{t.phone}</dt>
			<dd>{publisher.phone}</dd>
		{/if}
		{#if variant === 'notice' && publisher.siren}
			<dt>{t.siren}</dt>
			<dd>{publisher.siren}</dd>
		{/if}
		{#if variant === 'notice' && publisher.vat}
			<dt>{t.vat}</dt>
			<dd>{publisher.vat}</dd>
		{/if}
		{#if variant === 'notice' && publisher.director}
			<dt>{t.director}</dt>
			<dd>{publisher.director}</dd>
		{/if}
	</dl>
{/if}
