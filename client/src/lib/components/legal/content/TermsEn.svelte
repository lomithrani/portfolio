<!--
@component
Terms of use (English): eligibility (age and working age), the service, accounts and portfolios,
user content and its licence, prohibited content (discriminatory job descriptions, minors),
recruiters (accepted when opening the recruiter space; real positions, the pay actually offered,
no age limit, the right to act for the employer), imports, meetings, moderation (DSA arts 14, 16,
17), termination, liability, changes, law.
-->
<script module lang="ts">
	import type { LegalSection } from '../legalDocuments.ts';

	export const sections: readonly LegalSection[] = [
		{ id: 'about', title: 'About these terms' },
		{ id: 'eligibility', title: 'Who may use the site' },
		{ id: 'service', title: 'The service' },
		{ id: 'account', title: 'Your account and your portfolio' },
		{ id: 'content', title: 'Your content' },
		{ id: 'prohibited', title: 'What is not allowed' },
		{ id: 'recruiters', title: 'Job descriptions and recruiters' },
		{ id: 'imports', title: 'Résumé and job description imports' },
		{ id: 'meetings', title: 'Hiring journeys and meetings' },
		{ id: 'moderation', title: 'Reports and moderation' },
		{ id: 'termination', title: 'Deleting your account, suspension' },
		{ id: 'liability', title: 'Liability' },
		{ id: 'changes', title: 'Changes to these terms' },
		{ id: 'law', title: 'Governing law and disputes' },
		{ id: 'contact', title: 'Contact' }
	];
</script>

<script lang="ts">
	import { resolve } from '$app/paths';
	import { LEGAL_VERSION, MINIMUM_AGE } from 'portfolio-common';
	import ContactEmail from '../ContactEmail.svelte';
	import LegalDocLink from '../LegalDocLink.svelte';
	import { SITE_NAME, legalLastUpdated, type LegalPublisher } from '../legalDocuments.ts';

	let { publisher }: { publisher: LegalPublisher } = $props();

	const lang = 'en';
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- the links left are external sites, mailto: and in-page anchors (facts.ts); the site's pages go through resolve() (LegalDocLink) -->
<h3 id="about">About these terms</h3>
<p>
	These terms of use set the rules between you and the publisher of {SITE_NAME} (see the
	<LegalDocLink doc="notice" {lang}>legal notice</LegalDocLink>) when you use the site. You accept
	them by ticking the confirmation box when the site asks for it (when you sign up from the home
	page, claim a portfolio or open the recruiter space), and by using an account. This is version
	{LEGAL_VERSION}, in force since {legalLastUpdated(lang)}. How we process personal data is
	explained in the <LegalDocLink doc="privacy" {lang}>privacy policy</LegalDocLink>.
</p>

<h3 id="eligibility">Who may use the site</h3>
<p>Anyone can read portfolios and job descriptions. To create an account you must:</p>
<ul>
	<li>
		be at least <strong>{MINIMUM_AGE} years old</strong> and have reached the
		<strong>minimum legal working age in your country</strong>, which you confirm when the site asks
		for it (when you sign up from the home page, claim a portfolio or open the recruiter space);
	</li>
	<li>have a Google account, which you use to sign in;</li>
	<li>if you publish job descriptions for an organisation, be allowed to act on its behalf.</li>
</ul>
<p>
	Using an account means that you meet these conditions, whether or not the site asked you to
	confirm them. The site is not intended for anyone younger. We delete accounts that we learn belong
	to someone who does not meet these conditions.
</p>

<h3 id="service">The service</h3>
<p>
	{SITE_NAME} lets candidates publish a portfolio of their experiences and projects at their own address,
	with a timeline and skill filters, and set a hiring journey that recruiters follow before booking a
	meeting with them. Recruiters can publish job descriptions and see the portfolios that apply.
</p>
<p>
	The service is <strong>free</strong> and provided <strong>as it is</strong>. We work to keep it
	available and correct, but we do not guarantee that it is always available or free of errors, and
	we may change, limit or stop features, telling you in advance when a change affects you
	significantly. The site helps candidates and recruiters meet; it does not guarantee a job, a
	candidate or a meeting, and it is not a party to any contract between them.
</p>

<h3 id="account">Your account and your portfolio</h3>
<ul>
	<li>An account can own one portfolio, at one address.</li>
	<li>
		Addresses are given first come, first served. Some are reserved for the site. We may take back
		an address that impersonates someone, infringes a trademark or misleads visitors.
	</li>
	<li>
		You are responsible for what is done with your account. Sign out on shared devices, and tell us
		if you think someone else used it.
	</li>
</ul>

<h3 id="content">Your content</h3>
<p>
	You keep all your rights to what you publish: portfolio, experiences and projects, journey notes,
	job descriptions. You grant the publisher a free, non-exclusive, worldwide licence to host, store,
	reproduce and display this content on the site, and to make it available to the public, for as
	long as it is online. The licence ends when you delete the content or your account.
</p>
<p>You are responsible for your content. In particular, you confirm that:</p>
<ul>
	<li>it is accurate and does not mislead about your experience, skills or identity;</li>
	<li>
		you have the right to publish it (texts, logos, images) and it respects the law and other
		people's rights;
	</li>
	<li>
		you understand that it is public: do not publish information you want to keep private, such as
		health data, religious or political views, identity numbers or a home address.
	</li>
</ul>
<p>
	The step suggestions and feedback you send are published as public issues on GitHub, in the
	project's repository, without your name (see the
	<LegalDocLink doc="privacy" {lang} hash="data-feedback">privacy policy</LegalDocLink>). You grant
	the publisher the same licence to publish them there and to use them to improve the site; it does
	not end with your account, but you can ask us to remove an issue. Write in them nothing you want
	to keep private, no one else's personal data and nothing unlawful: we may remove an issue that
	breaks these terms.
</p>

<h3 id="prohibited">What is not allowed</h3>
<p>You must not use the site to:</p>
<ul>
	<li>
		publish illegal content, such as hate speech, harassment, defamation, content that sexualises
		minors, or content that infringes intellectual property or privacy;
	</li>
	<li>
		impersonate someone, create a portfolio in someone else's name without their permission, or lie
		about your identity;
	</li>
	<li>publish other people's personal data without a legal basis;</li>
	<li>
		publish discriminatory job descriptions, that is, that select candidates on their origin, sex,
		sexual orientation, gender identity, age, family situation, pregnancy, disability, state of
		health, religious beliefs, political opinions, trade union activity, physical appearance,
		surname, place of residence or any other criterion forbidden by article L1132-1 of the French
		Labour Code or the law that applies to the job;
	</li>
	<li>
		target people below the legal working age, or offer work that the law forbids for minors to
		people under 18;
	</li>
	<li>publish fake job offers, scams, or ask candidates for money;</li>
	<li>send spam, unsolicited advertising, or book meetings you do not intend to attend;</li>
	<li>
		collect portfolios or job descriptions by automated means (scraping), other than search engines
		indexing public pages;
	</li>
	<li>
		attack, overload or probe the site, get around its limits and quotas, or abuse the imports (for
		example by sending documents that are not résumés or job descriptions, or that you have no right
		to use);
	</li>
	<li>spread malware or links to malicious sites.</li>
</ul>

<h3 id="recruiters">Job descriptions and recruiters</h3>
<p>
	To open the recruiter space, recruiters accept these terms (the site asks for them then, unless
	they already accepted the version in force), and they accept them again when they change
	materially, before they use the space again. Recruiters are responsible for their job
	descriptions, and commit to:
</p>
<ul>
	<li>
		describe a <strong>real position</strong>, open or about to open, with the contract and
		conditions actually offered;
	</li>
	<li>
		state the <strong>pay actually offered</strong>: a job description must not mislead about the
		position, its pay, its place of work or anything else it offers (article L5331-3 of the French
		Labour Code);
	</li>
	<li>
		set <strong>no age limit</strong>, unless the law requires one (article L5331-2 of the French
		Labour Code), nor any other discriminatory criterion (see
		<a class="link-text" href="#prohibited">what is not allowed</a>);
	</li>
	<li>
		be the employer, or be <strong>allowed to act on its behalf</strong>;
	</li>
	<li>comply with employment law.</li>
</ul>
<p>
	Before hiring, recruiters must check that the candidate is legally allowed to do the job,
	including their age and right to work. The site does not select, score or rank candidates, and it
	is not a recruitment agency or an employer.
</p>

<h3 id="imports">Résumé and job description imports</h3>
<p>
	The imports send your PDF to Claude, an AI model made by Anthropic, which proposes drafts. The
	drafts can be incomplete or wrong: review them before adding them, as you are responsible for what
	you publish. Only send documents you have the right to use. Imports are limited in number, and we
	may suspend the feature, for example to prevent abuse.
</p>

<h3 id="meetings">Hiring journeys and meetings</h3>
<p>
	A portfolio owner who offers meetings connects their Google Calendar. When a visitor books, their
	name, email address and note go into the owner's calendar invitation. Owners must use this
	information only to organise the meeting and the hiring process that follows, in line with data
	protection law. Visitors book only meetings they intend to attend, and cancel them otherwise.
</p>

<h3 id="moderation">Reports and moderation</h3>
<p>
	We do not check content before it is published, and no automated tool moderates it. Anyone can
	report content they believe is illegal or against these terms, as described in the
	<LegalDocLink doc="notice" {lang} hash="report">legal notice</LegalDocLink>. A person examines
	each report.
</p>
<p>
	When content is illegal or breaks these terms, we may remove it or restrict access to it, and
	suspend or close the account, in proportion to the seriousness and repetition of the breach. We
	then tell the person concerned by email, unless the law forbids it, with a statement of reasons:
	what we decided and its scope, the facts and circumstances, the legal ground or the clause of
	these terms it relies on, that no automated means were used, and how to contest it.
</p>
<p>
	You can contest a decision, or our refusal to act on your report, within six months by replying to
	our email or writing to <ContactEmail {publisher} {lang} />. We review the decision again and
	answer you. You can also go to court.
</p>

<h3 id="termination">Deleting your account, suspension</h3>
<p>
	You can stop using the site and delete your account at any time from
	<a class="link-text" href={resolve('/(site)/account')}>your account page</a>. Deletion is
	immediate and final: your portfolio and everything tied to your account are removed, and your
	portfolio address becomes available to others.
</p>
<p>
	We may suspend or close an account that seriously or repeatedly breaks these terms or the law, as
	described above. Except in urgent cases (illegal content, security, protection of others), we warn
	you first.
</p>

<h3 id="liability">Liability</h3>
<p>
	To the extent the law allows, the publisher is not liable for indirect damage, for the loss of
	content you did not keep elsewhere, for content published by users, for decisions made by
	recruiters or candidates, or for what happens between people who meet through the site. As a host,
	the publisher is not liable for content published by users that it does not know to be illegal,
	and acts promptly once informed of it.
</p>
<p>
	Nothing in these terms limits liability that the law does not allow to limit (such as for gross
	negligence or wilful misconduct), or takes away the protections that the mandatory consumer law of
	your country of residence gives you.
</p>

<h3 id="changes">Changes to these terms</h3>
<p>
	When we change these terms materially, we update their date and version, tell you on the site or
	by email before the change applies, and ask you to accept the new version when you next sign up or
	claim a portfolio, before you use the recruiter space again, or from your account page. If you do
	not accept it, you can stop using the site and delete your account.
</p>

<h3 id="law">Governing law and disputes</h3>
<p>
	These terms are governed by French law. Before going to court, write to us so that we can look for
	an amicable solution. Failing that, the French courts have jurisdiction. If you are a consumer,
	you keep the protection of the mandatory rules of the country where you live, and you can also
	bring proceedings before its courts.
</p>

<h3 id="contact">Contact</h3>
<p>
	For any question about these terms: <ContactEmail {publisher} {lang} />.
</p>
