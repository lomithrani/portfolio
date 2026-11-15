<!--
@component
Legal notice (English): publisher, host, points of contact (DSA arts 11 and 12), reporting illegal
content (DSA art. 16), intellectual property. The publisher's identity comes from the LEGAL_*
variables only (PublisherDetails).
-->
<script module lang="ts">
	import type { LegalSection } from '../legalDocuments.ts';

	export const sections: readonly LegalSection[] = [
		{ id: 'publisher', title: 'Publisher' },
		{ id: 'host', title: 'Host' },
		{ id: 'contact', title: 'Contact for users and authorities' },
		{ id: 'report', title: 'Reporting illegal content' },
		{ id: 'intellectual-property', title: 'Intellectual property' },
		{ id: 'personal-data', title: 'Personal data and cookies' }
	];
</script>

<script lang="ts">
	import ContactEmail from '../ContactEmail.svelte';
	import LegalDocLink from '../LegalDocLink.svelte';
	import PublisherDetails from '../PublisherDetails.svelte';
	import { SITE_NAME, type LegalPublisher } from '../legalDocuments.ts';
	import { HOST } from './facts.ts';

	let { publisher }: { publisher: LegalPublisher } = $props();

	const lang = 'en';
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- the links left are external sites, mailto: and in-page anchors (facts.ts); the site's pages go through resolve() (LegalDocLink) -->
<h3 id="publisher">Publisher</h3>
<p>This site, {SITE_NAME}, is published by:</p>
<PublisherDetails {publisher} {lang} />
{#if publisher.configured && !publisher.siren && (!publisher.address || !publisher.phone)}
	<p>
		The publisher is an individual acting on a non-professional basis. As article 1-1 II of French
		law no. 2004-575 of 21 June 2004 on confidence in the digital economy (LCEN) allows, the details
		not shown here have been given to the host, who keeps them confidential except when a court asks
		for them.
	</p>
{/if}

<h3 id="host">Host</h3>
<p>The web application, its API and its database are hosted by:</p>
<dl class="legal-details">
	<dt>Name</dt>
	<dd>{HOST.name}</dd>
	<dt>Address</dt>
	<dd>{HOST.address}</dd>
	<dt>Contact</dt>
	<dd>
		<a class="link-text" href="mailto:{HOST.email}">{HOST.email}</a>,
		<a class="link-text" href={HOST.website} rel="noopener noreferrer">{HOST.websiteLabel}</a>
	</dd>
	<dt>Phone</dt>
	<dd>
		{#if HOST.phone}
			<a class="link-text" href="tel:{HOST.phone.replace(/\s/g, '')}">{HOST.phone}</a>
		{:else}
			The host publishes no phone number: it can be reached at the email and postal addresses above.
		{/if}
	</dd>
	<dt>Location of the servers</dt>
	<dd>United States (Railway region US West)</dd>
</dl>

<h3 id="contact">Contact for users and authorities</h3>
<p>
	One address for everything: <ContactEmail {publisher} {lang} />. It is the single point of contact
	of this site for its users (article 12 of the Digital Services Act, Regulation (EU) 2022/2065) and
	for the authorities of the Member States, the European Commission and the European Board for
	Digital Services (article 11). We read and answer in <strong>English</strong> and
	<strong>French</strong>. A person answers: messages are never handled only by automated tools.
</p>
<p>
	Privacy requests (access, deletion and your other rights) go to the same address: see the
	<LegalDocLink doc="privacy" {lang} hash="rights">privacy policy</LegalDocLink>.
</p>

<h3 id="report">Reporting illegal content</h3>
<p>
	Anyone can tell us about content on this site they believe is illegal: a portfolio, a job
	description, a hiring journey note or anything else users publish. Write to
	<ContactEmail {publisher} {lang} subject="Report" /> with the subject <strong>Report</strong>, and
	include:
</p>
<ol>
	<li>the exact address (URL) of the content, and where on the page it is if the page is long;</li>
	<li>why you believe it is illegal, with enough detail for us to understand it;</li>
	<li>
		your name and email address (not required when the report concerns child sexual abuse material);
	</li>
	<li>
		a statement that you believe in good faith that the information and allegations in your report
		are accurate and complete.
	</li>
</ol>
<p>
	We confirm that we received your report, examine it carefully, objectively and without delay, and
	tell you what we decided and how you can contest the decision. When we remove or restrict content
	or suspend an account, we tell the person concerned why and how to contest it, as described in the
	<LegalDocLink doc="terms" {lang} hash="moderation">terms of use</LegalDocLink>. If a report
	suggests a criminal offence that threatens someone's life or safety, we inform the competent
	authorities.
</p>
<p>
	In France you can also report illegal content to the authorities on
	<a class="link-text" href="https://www.internet-signalement.gouv.fr" rel="noopener noreferrer"
		>internet-signalement.gouv.fr</a
	> (PHAROS).
</p>

<h3 id="intellectual-property">Intellectual property</h3>
<p>
	The structure, design, code and texts of this site belong to the publisher or to its licensors,
	unless stated otherwise, and are protected by intellectual property law.
</p>
<p>
	Content that users publish (portfolios, experiences and projects, job descriptions, hiring journey
	notes) belongs to the people who published it. They grant this site only the licence described in
	the <LegalDocLink doc="terms" {lang} hash="content">terms of use</LegalDocLink>, to host and show
	it while it is online. Company names, logos and trademarks shown in portfolios and job
	descriptions belong to their owners.
</p>

<h3 id="personal-data">Personal data and cookies</h3>
<p>
	How this site processes personal data, and your rights, are explained in the
	<LegalDocLink doc="privacy" {lang}>privacy policy</LegalDocLink>. The cookies and the browser
	storage it uses are listed on the
	<LegalDocLink doc="cookies" {lang}>cookies and local storage</LegalDocLink> page. The rules for using
	the site are in the <LegalDocLink doc="terms" {lang}>terms of use</LegalDocLink>.
</p>
