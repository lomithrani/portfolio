<!--
@component
Mentions légales (français) : éditeur, hébergeur, points de contact (DSA art. 11 et 12),
signalement des contenus illicites (DSA art. 16), propriété intellectuelle. L'identité de
l'éditeur vient uniquement des variables LEGAL_* (PublisherDetails).
-->
<script module lang="ts">
	import type { LegalSection } from '../legalDocuments.ts';

	export const sections: readonly LegalSection[] = [
		{ id: 'publisher', title: 'Éditeur' },
		{ id: 'host', title: 'Hébergeur' },
		{ id: 'contact', title: 'Contact des utilisateurs et des autorités' },
		{ id: 'report', title: 'Signaler un contenu illicite' },
		{ id: 'intellectual-property', title: 'Propriété intellectuelle' },
		{ id: 'personal-data', title: 'Données personnelles et cookies' }
	];
</script>

<script lang="ts">
	import ContactEmail from '../ContactEmail.svelte';
	import LegalDocLink from '../LegalDocLink.svelte';
	import PublisherDetails from '../PublisherDetails.svelte';
	import { SITE_NAME, type LegalPublisher } from '../legalDocuments.ts';
	import { HOST } from './facts.ts';

	let { publisher }: { publisher: LegalPublisher } = $props();

	const lang = 'fr';
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- the links left are external sites, mailto: and in-page anchors (facts.ts); the site's pages go through resolve() (LegalDocLink) -->
<h3 id="publisher">Éditeur</h3>
<p>Ce site, {SITE_NAME}, est édité par :</p>
<PublisherDetails {publisher} {lang} />
{#if publisher.configured && !publisher.siren && (!publisher.address || !publisher.phone)}
	<p>
		L'éditeur est un particulier agissant à titre non professionnel. Comme le permet l'article 1-1
		II de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN), les
		éléments d'identification qui ne figurent pas ici ont été communiqués à l'hébergeur, qui les
		garde confidentiels sauf à la demande d'un juge.
	</p>
{/if}

<h3 id="host">Hébergeur</h3>
<p>L'application web, son API et sa base de données sont hébergées par :</p>
<dl class="legal-details">
	<dt>Nom</dt>
	<dd>{HOST.name}</dd>
	<dt>Adresse</dt>
	<dd>{HOST.address}</dd>
	<dt>Contact</dt>
	<dd>
		<a class="link-text" href="mailto:{HOST.email}">{HOST.email}</a>,
		<a class="link-text" href={HOST.website} rel="noopener noreferrer">{HOST.websiteLabel}</a>
	</dd>
	<dt>Téléphone</dt>
	<dd>
		{#if HOST.phone}
			<a class="link-text" href="tel:{HOST.phone.replace(/\s/g, '')}">{HOST.phone}</a>
		{:else}
			L'hébergeur ne publie pas de numéro de téléphone : il peut être joint aux adresses
			électronique et postale ci-dessus.
		{/if}
	</dd>
	<dt>Localisation des serveurs</dt>
	<dd>États-Unis (région Railway US West)</dd>
</dl>

<h3 id="contact">Contact des utilisateurs et des autorités</h3>
<p>
	Une seule adresse pour tout : <ContactEmail {publisher} {lang} />. C'est le point de contact
	unique de ce site pour ses utilisateurs (article 12 du règlement sur les services numériques,
	règlement (UE) 2022/2065) et pour les autorités des États membres, la Commission européenne et le
	Comité européen des services numériques (article 11). Nous lisons et répondons en
	<strong>français</strong> et en <strong>anglais</strong>. Une personne vous répond : les messages
	ne sont jamais traités uniquement par des outils automatisés.
</p>
<p>
	Les demandes relatives à vos données (accès, suppression et vos autres droits) se font à la même
	adresse : voir la
	<LegalDocLink doc="privacy" {lang} hash="rights">politique de confidentialité</LegalDocLink>.
</p>

<h3 id="report">Signaler un contenu illicite</h3>
<p>
	Toute personne peut nous signaler un contenu de ce site qu'elle estime illicite : un portfolio,
	une offre d'emploi, une note d'un parcours de recrutement ou tout autre contenu publié par les
	utilisateurs. Écrivez à <ContactEmail {publisher} {lang} subject="Signalement" /> avec l'objet
	<strong>Signalement</strong>, en indiquant :
</p>
<ol>
	<li>
		l'adresse exacte (URL) du contenu, et l'endroit de la page où il se trouve si elle est longue ;
	</li>
	<li>
		les raisons pour lesquelles vous l'estimez illicite, avec assez de précision pour les comprendre
		;
	</li>
	<li>
		vos nom et adresse e-mail (sauf si le signalement concerne des contenus d'abus sexuels sur
		mineurs) ;
	</li>
	<li>
		une déclaration confirmant que vous estimez de bonne foi que les informations et allégations de
		votre signalement sont exactes et complètes.
	</li>
</ol>
<p>
	Nous accusons réception de votre signalement, l'examinons avec soin, objectivité et sans délai,
	puis vous informons de notre décision et des moyens de la contester. Lorsque nous retirons ou
	restreignons un contenu, ou suspendons un compte, nous en indiquons les motifs à la personne
	concernée ainsi que les moyens de contester, comme le prévoient les
	<LegalDocLink doc="terms" {lang} hash="moderation">conditions d'utilisation</LegalDocLink>. Si un
	signalement laisse soupçonner une infraction pénale menaçant la vie ou la sécurité d'une personne,
	nous en informons les autorités compétentes.
</p>
<p>
	En France, vous pouvez aussi signaler un contenu illicite aux autorités sur
	<a class="link-text" href="https://www.internet-signalement.gouv.fr" rel="noopener noreferrer"
		>internet-signalement.gouv.fr</a
	> (PHAROS).
</p>

<h3 id="intellectual-property">Propriété intellectuelle</h3>
<p>
	La structure, le design, le code et les textes de ce site appartiennent à l'éditeur ou à ses
	concédants, sauf mention contraire, et sont protégés par le droit de la propriété intellectuelle.
</p>
<p>
	Les contenus publiés par les utilisateurs (portfolios, expériences et projets, offres d'emploi,
	notes des parcours de recrutement) appartiennent aux personnes qui les ont publiés. Elles
	accordent à ce site uniquement la licence décrite dans les
	<LegalDocLink doc="terms" {lang} hash="content">conditions d'utilisation</LegalDocLink>, pour les
	héberger et les afficher tant qu'ils sont en ligne. Les noms, logos et marques des entreprises
	cités dans les portfolios et les offres appartiennent à leurs titulaires.
</p>

<h3 id="personal-data">Données personnelles et cookies</h3>
<p>
	La manière dont ce site traite les données personnelles, et vos droits, sont expliqués dans la
	<LegalDocLink doc="privacy" {lang}>politique de confidentialité</LegalDocLink>. Les cookies et le
	stockage du navigateur qu'il utilise sont listés sur la page
	<LegalDocLink doc="cookies" {lang}>cookies et stockage local</LegalDocLink>. Les règles
	d'utilisation du site figurent dans les
	<LegalDocLink doc="terms" {lang}>conditions d'utilisation</LegalDocLink>.
</p>
