<!--
@component
Privacy policy (English): GDPR art. 13, CalOPPA (Do Not Track, third-party tracking), the Google API
Services User Data Policy (Limited Use statement), AI disclosure and transfers. Every statement is
checked against the code (what is stored, sent, logged and for how long); keep it in step.
-->
<script module lang="ts">
	import type { LegalSection } from '../legalDocuments.ts';

	export const sections: readonly LegalSection[] = [
		{ id: 'summary', title: 'In short' },
		{ id: 'controller', title: 'Who is responsible for your data' },
		{ id: 'data', title: 'What we collect and why' },
		{ id: 'legal-bases', title: 'Purposes and legal bases' },
		{ id: 'recipients', title: 'Who receives your data' },
		{ id: 'transfers', title: 'Transfers outside the European Union' },
		{ id: 'retention', title: 'How long we keep it' },
		{ id: 'rights', title: 'Your rights' },
		{ id: 'required', title: 'What you have to provide' },
		{ id: 'ai', title: 'AI and automated decisions' },
		{ id: 'children', title: 'Children' },
		{ id: 'security', title: 'Security' },
		{ id: 'cookies', title: 'Cookies and local storage' },
		{ id: 'tracking', title: 'Do Not Track, tracking and sale of data' },
		{ id: 'google', title: 'Google user data' },
		{ id: 'changes', title: 'Changes to this policy' }
	];
</script>

<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { MINIMUM_AGE } from 'portfolio-common';
	import ContactEmail from '../ContactEmail.svelte';
	import LegalDocLink from '../LegalDocLink.svelte';
	import PublisherDetails from '../PublisherDetails.svelte';
	import {
		LOG_RETENTION,
		SITE_NAME,
		legalLastUpdated,
		type LegalPublisher
	} from '../legalDocuments.ts';
	import {
		CNIL,
		GOOGLE_CALENDAR_SCOPE,
		HOST,
		IMPORT_MAX_MB,
		LINKS,
		SESSION_DAYS
	} from './facts.ts';

	let { publisher }: { publisher: LegalPublisher } = $props();

	const lang = 'en';
	const logRetention = LOG_RETENTION.en;
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- the links left are external sites, mailto: and in-page anchors (facts.ts); the site's pages go through resolve() (LegalDocLink) -->
<h3 id="summary">In short</h3>
<div class="legal-callout">
	<ul>
		<li>
			To sign in, we keep only your Google account identifier and your email address. Your Google
			name and picture are not kept.
		</li>
		<li>
			What you put in your portfolio is public: it is the point of the site. Do not publish what you
			want to keep private.
		</li>
		<li>
			If you import a résumé, the PDF is sent to Anthropic (USA) to draft your experiences. We do
			not store the PDF, and nothing is published until you add it yourself.
		</li>
		<li>
			No advertising, no analytics, no sale of data. Our only cookies keep you signed in and
			remember the language you chose; Google's sign-in, loaded only when you ask for it, sets
			cookies of its own.
		</li>
		<li>
			You can delete your account and everything in it at any time from
			<a class="link-text" href={resolve('/(site)/account')}>your account page</a>.
		</li>
	</ul>
</div>

<h3 id="controller">Who is responsible for your data</h3>
<p>
	The data controller is the publisher of {SITE_NAME}:
</p>
<PublisherDetails {publisher} {lang} variant="controller" />
<p>
	For any question about your data or to exercise your rights, write to
	<ContactEmail {publisher} {lang} />. No data protection officer has been appointed: the processing
	described here does not require one.
</p>

<h3 id="data">What we collect and why</h3>

<h4 id="data-account">Your account and Google sign-in</h4>
<p>
	You sign in with your Google account. Google sends us a signed token; we check it and keep only
	your <strong>Google account identifier</strong> and your <strong>email address</strong>. The name
	and picture of your Google account are not kept. We also store the space you use (candidate or
	recruiter), the settings of your recruiter space if you open one (its plan and how many job
	description imports you used), and a record of each time you accepted the terms of use: the
	version, the date, the key of the age confirmation you ticked and where you ticked it. We do not
	ask for or store your date of birth.
</p>

<h4 id="data-portfolio">Your portfolio (public)</h4>
<p>
	When you claim a portfolio, its address (for example <code>{page.url.host}/jane.doe</code>) and
	everything you add to it are <strong>public</strong>: anyone can read them and search engines can
	index them. This includes the title and subtitle of the header (usually your name), the theme,
	your experiences with their companies, locations, dates and descriptions, your projects and
	skills, your hiring journey and its notes, and the public part of your booking schedules (title,
	description, time zone, meeting location and available times). The public data of a portfolio also
	contains a random internal identifier of the owner's account, never their email address.
</p>
<p>
	The descriptions of experiences and projects can show images hosted on other sites, chosen by the
	portfolio's owner. Visitors' browsers load them from those sites, which then receive the visitor's
	IP address and browser details, under their own rules. We do not choose or control these images.
</p>

<h4 id="data-resume">Résumé import (optional)</h4>
<p>
	If you choose to import a résumé, your PDF (up to {IMPORT_MAX_MB} MB) and its file name are sent to
	Anthropic's Claude model, which reads it and proposes drafts of your experiences. The drafts come back
	to your browser, where you review, edit or discard them; nothing is added to your portfolio until you
	add it. We do not store the PDF or the drafts on our servers. While you review them, the drafts are
	kept in your browser (see <LegalDocLink doc="cookies" {lang}
		>cookies and local storage</LegalDocLink
	>). To enforce the import limits, we count imports with counters keyed by a hash of your account
	identifier (see <a class="link-text" href="#retention">how long we keep it</a> for what happens to them
	when you delete your account). Avoid sending a résumé with information you would not want processed,
	such as an ID number or health data.
</p>

<h4 id="data-recruiter">Recruiter space and job descriptions</h4>
<p>
	Recruiters write job descriptions: title, company, location, work mode, contract, working time,
	pay, requirements, benefits and description. Once published, a job description is public, but it
	never names the recruiter's account. A job description PDF can also be imported: it is sent to
	Anthropic like a résumé, and not stored by us. Where this site computes travel times (see <a
		class="link-text"
		href="#data-perfect-job">perfect job</a
	>), the address of a job's office (street, postal code and town) is sent to the Géoplateforme of
	IGN, the map service that locates it: as it is typed in the job editor, when its fields are left,
	and when the job description is scored in a hiring journey with a commute criterion, even for a
	draft that is never published.
</p>

<h4 id="data-applications">Applications</h4>
<p>
	When you apply to a job description with your portfolio, the recruiter who published it sees your
	application with your portfolio's address and header title. A recruiter can also add a public
	portfolio to the list of applicants of one of their job descriptions; that portfolio's owner can
	then appear in the recruiter's list. You can withdraw an application, and the recruiter can remove
	it; it is deleted with the job description.
</p>

<h4 id="data-journey">Hiring journey and meetings</h4>
<p>
	A portfolio owner can ask visitors to go through steps before booking a meeting (read a note,
	choose one of their job descriptions, then book). For a signed-in visitor, we store the progress
	in each journey: which steps are done and when, the job description chosen, and when a meeting was
	booked.
</p>
<p>
	To book a meeting you enter your <strong>name</strong>, your <strong>email address</strong> and, if
	you wish, a note. They are not stored in our database: they are sent to the portfolio owner's Google
	Calendar, which creates the event with you as a guest and emails you the invitation. The invitation
	also contains the details of the earlier steps (for example the title, company and link of the job description
	you chose). We keep only a reservation of the time slot (the time, the calendar, the event identifier
	and a hash of your email address keyed with a secret), which is deleted automatically when the slot
	ends or the meeting is cancelled.
</p>

<h4 id="data-perfect-job">Your perfect job (private)</h4>
<p>
	A portfolio owner can describe the job they are looking for: criteria such as the pay they ask
	for, the contracts and work modes they accept, their skills, and how much each one matters. It is
	<strong>private</strong>: only its owner can read it. If the owner adds the matching step to their
	hiring journey, the job description a recruiter picks is scored against these criteria, out of
	100, by fixed rules. The recruiter sees the score and the minimum the owner set and, if the owner
	chooses so, the name of each criterion and whether their job matches it; never what the owner
	asked for. A recruiter who tries several job descriptions can still infer part of it from the
	scores.
</p>
<p>
	The commute criterion is optional, and offered only where this site computes travel times. It
	stores the address you travel from (a place nearby does as well as your home) and where it is on a
	map. To find it, as you type it and when you save it, and to compute travel times to a job, that
	address is sent to the Géoplateforme of IGN, the French state's map service, and, where public
	transport is offered, its position to the journey planner this site uses: HERE, or Transitous, a
	journey planner run by volunteers. None of them receives your name, your account or your IP
	address. Recruiters never see your address; whether the commute to their job matches does say
	something about where you are. The address of a job's office, typed by its recruiter, is looked up
	the same way.
</p>

<h4 id="data-calendar">Google Calendar (portfolio owners)</h4>
<p>
	A portfolio owner who offers meetings connects their Google Calendar. We then store the access
	tokens Google gives us, which let the site read when the owner is busy and create the events that
	visitors book. Details are in <a class="link-text" href="#google">Google user data</a>.
</p>

<h4 id="data-suggestions">Step suggestions</h4>
<p>
	Portfolio owners can suggest a new kind of journey step. The text of the suggestion (a name, what
	a recruiter would do, why it would help) is published as a <strong>public issue on GitHub</strong
	>, without your name or any identifier. Your account identifier is written only in our server log.
</p>

<h4 id="data-technical">Technical data</h4>
<p>
	To protect the site against abuse, we count some requests (meeting bookings, availability checks,
	portfolio address checks) per IP address and per email address. The counters store only a hash of
	the address keyed with a secret, never the address itself, and are deleted automatically at the
	end of their window (from one hour to 30 days).
</p>
<p>
	Our servers write a log of the requests they handle (method, route, status and errors), without IP
	addresses, emails or names. Our host records its own logs of incoming requests, and, when
	monitoring is enabled, our monitoring provider receives traces of the requests, which include the
	IP address, the browser's user agent, the address of the page without its query string, and the
	request headers (cookies, authorisation headers, query strings and request bodies are removed
	before they are sent).
</p>

<h4 id="data-device">On your device</h4>
<p>
	The site sets two cookies of its own, one to keep you signed in and one to remember the language
	you chose, and stores some data in your browser (theme, unsaved drafts). Google's sign-in, when
	you ask for it, sets cookies of its own. See <LegalDocLink doc="cookies" {lang}
		>cookies and local storage</LegalDocLink
	>.
</p>

<h3 id="legal-bases">Purposes and legal bases</h3>
<div class="legal-table">
	<table>
		<thead>
			<tr>
				<th scope="col">Purpose</th>
				<th scope="col">Legal basis (GDPR art. 6)</th>
			</tr>
		</thead>
		<tbody>
			<tr>
				<td>Create your account, sign you in and keep you signed in</td>
				<td>Performance of the contract (the terms of use), art. 6(1)(b)</td>
			</tr>
			<tr>
				<td>Publish your portfolio, your hiring journey and your booking schedules</td>
				<td>Contract, art. 6(1)(b)</td>
			</tr>
			<tr>
				<td>
					Score the job descriptions picked in your hiring journey against your perfect job, and
					compute the travel times it asks for
				</td>
				<td>Contract, art. 6(1)(b)</td>
			</tr>
			<tr>
				<td>Import a résumé or a job description PDF when you ask for it</td>
				<td>Contract, art. 6(1)(b)</td>
			</tr>
			<tr>
				<td>Recruiter space, public job pages and applications</td>
				<td>Contract, art. 6(1)(b)</td>
			</tr>
			<tr>
				<td>
					Journey progress and meeting booking, including sending your details to the portfolio
					owner's calendar
				</td>
				<td>Contract, or steps taken at your request before one, art. 6(1)(b)</td>
			</tr>
			<tr>
				<td>Connect a portfolio owner's Google Calendar</td>
				<td>Contract, art. 6(1)(b)</td>
			</tr>
			<tr>
				<td>File your step suggestions on GitHub</td>
				<td>Contract, art. 6(1)(b)</td>
			</tr>
			<tr>
				<td>Keep a record of your acceptance of the terms and of your age confirmation</td>
				<td>
					Legitimate interest, art. 6(1)(f): being able to show which terms you accepted and that
					you declared the required age
				</td>
			</tr>
			<tr>
				<td> Security, rate limits, import quotas, abuse prevention, logs and monitoring </td>
				<td>
					Legitimate interest, art. 6(1)(f): keeping the site secure and available, preventing spam
					bookings and the abuse of paid AI imports. The data is minimal, hashed where possible and
					kept briefly; you can object (see <a class="link-text" href="#rights">your rights</a>)
				</td>
			</tr>
			<tr>
				<td>
					Answer your requests and reports, and comply with the law (data protection, Digital
					Services Act, requests from authorities)
				</td>
				<td>Legal obligation, art. 6(1)(c)</td>
			</tr>
		</tbody>
	</table>
</div>
<p>We do not use your data for advertising or profiling, and we never sell it.</p>

<h3 id="recipients">Who receives your data</h3>
<ul>
	<li>
		<strong>The public</strong>: the content of portfolios, published job descriptions (without the
		recruiter's identity), journey notes and the public part of booking schedules.
	</li>
	<li>
		<strong>Recruiters</strong>: the address and header title of the portfolios on the applicant
		lists of their job descriptions.
	</li>
	<li>
		<strong>Portfolio owners</strong>: the name, email address and note of a visitor who books a
		meeting, with the details of the journey steps before it, in their Google Calendar invitation.
	</li>
	<li>
		<strong>Our processors</strong>, which act on our instructions:
		<ul>
			<li>
				{HOST.name} (USA): hosting of the web application, the API, the database and their logs, in its
				US West region (<a class="link-text" href={LINKS.railwayPrivacy} rel="noopener noreferrer"
					>privacy policy</a
				>);
			</li>
			<li>
				Anthropic PBC (USA): reading the résumé and job description PDFs you import. Under
				Anthropic's <a
					class="link-text"
					href={LINKS.anthropicCommercialTerms}
					rel="noopener noreferrer">commercial terms</a
				>, Anthropic does not train its models on content sent through its API;
			</li>
			<li>our monitoring provider: request traces and server logs, when monitoring is enabled.</li>
		</ul>
	</li>
	<li>
		<strong>Independent controllers</strong>, under their own policies:
		<ul>
			<li>
				Google LLC (USA): Sign in with Google, and the Google Calendar of the portfolio owners who
				connect it, which also emails meeting invitations (<a
					class="link-text"
					href={LINKS.googlePrivacy}
					rel="noopener noreferrer">Google privacy policy</a
				>);
			</li>
			<li>
				GitHub, Inc. (USA): the step suggestions, published as public issues (<a
					class="link-text"
					href={LINKS.githubPrivacy}
					rel="noopener noreferrer">GitHub privacy statement</a
				>);
			</li>
			<li>
				IGN, Institut national de l'information géographique et forestière (France): the addresses
				to locate and the points to compute a travel time between, for the commute criterion (<a
					class="link-text"
					href={LINKS.geoplateforme}
					rel="noopener noreferrer">Géoplateforme</a
				>);
			</li>
			<li>
				HERE (HERE Technologies, the Netherlands), or Transitous, a journey planner run by
				volunteers, whichever this site uses: the points to compute a public transport time between,
				where this site offers it (<a
					class="link-text"
					href={LINKS.herePrivacy}
					rel="noopener noreferrer">HERE privacy policy</a
				>,
				<a class="link-text" href={LINKS.transitous} rel="noopener noreferrer">transitous.org</a>).
			</li>
		</ul>
	</li>
	<li>
		<strong>Authorities</strong>, only when the law requires it.
	</li>
</ul>

<h3 id="transfers">Transfers outside the European Union</h3>
<p>
	Our host, Anthropic, Google, GitHub and our monitoring provider may process data in the
	<strong>United States</strong>; the database is hosted there. These transfers rely on the
	<a class="link-text" href={LINKS.dpf} rel="noopener noreferrer">EU-US Data Privacy Framework</a>
	(adequacy decision of the European Commission of 10 July 2023) for recipients certified under it, and
	otherwise on the
	<a class="link-text" href={LINKS.scc} rel="noopener noreferrer">standard contractual clauses</a> of
	the European Commission (decision (EU) 2021/914) in their data processing terms. You can ask us for
	a copy of these safeguards.
</p>

<h3 id="retention">How long we keep it</h3>
<div class="legal-table">
	<table>
		<thead>
			<tr>
				<th scope="col">Data</th>
				<th scope="col">How long</th>
			</tr>
		</thead>
		<tbody>
			<tr>
				<td>Account (Google identifier, email, spaces, acceptances of the terms)</td>
				<td>Until you delete your account</td>
			</tr>
			<tr>
				<td>
					Portfolio, experiences, hiring journey, perfect job (the address you travel from
					included), booking schedules, job descriptions, applications
				</td>
				<td>Until you delete them, or your account</td>
			</tr>
			<tr>
				<td>Travel times, and where the addresses of job descriptions are</td>
				<td>
					30 days for a travel time, 90 for the location of a job's address, under a keyed hash that
					does not show the addresses; they are not tied to an account
				</td>
			</tr>
			<tr>
				<td>Your progress in other portfolios' journeys</td>
				<td>
					Until you delete your account, or the owner removes the step or deletes their account
				</td>
			</tr>
			<tr>
				<td>Résumé and job description PDFs</td>
				<td>
					Not stored by us. Anthropic keeps API data only for a limited period under its commercial
					terms
				</td>
			</tr>
			<tr>
				<td>Meeting slot reservations</td>
				<td>
					Deleted automatically when the slot ends or the meeting is cancelled (the invitation stays
					in the calendars of the owner and of the guest, under Google's terms)
				</td>
			</tr>
			<tr>
				<td>Google Calendar tokens</td>
				<td>
					Until the owner disconnects Google Calendar or deletes their account; they are then
					deleted, and we ask Google to revoke the access
				</td>
			</tr>
			<tr>
				<td>Rate limit and quota counters (keyed hashes)</td>
				<td>
					Deleted automatically at the end of their window: one hour to 30 days. When you delete
					your account, the quotas you used (résumé and job description imports, step suggestions,
					and the job description imports of your recruiter plan) are carried over to counters keyed
					by a hash of your Google account identifier, kept until the end of their window (at most
					30 days), so that deleting and re-creating an account does not reset them
				</td>
			</tr>
			<tr>
				<td>Server logs, host logs and traces</td>
				<td>{logRetention}</td>
			</tr>
			<tr>
				<td>Messages you send us (requests, reports)</td>
				<td>As long as needed to handle them and keep a record of how they were handled</td>
			</tr>
			<tr>
				<td>Session cookie</td>
				<td>{SESSION_DAYS} days, or until you sign out</td>
			</tr>
			<tr>
				<td>Data stored in your browser</td>
				<td>
					Until you clear it, or as described on the <LegalDocLink doc="cookies" {lang}
						>cookies and local storage</LegalDocLink
					> page
				</td>
			</tr>
		</tbody>
	</table>
</div>
<p>
	Deleting your account from <a class="link-text" href={resolve('/(site)/account')}
		>your account page</a
	>
	is immediate: your account, your portfolio and its experiences, your hiring journey and the progress
	of its visitors, your progress in other journeys, your booking schedules and reservations, your job
	descriptions and their applications, and your applications are removed from our database at once, the
	Google Calendar tokens are deleted and we ask Google to revoke the access (you can check it in your
	<a class="link-text" href={LINKS.googlePermissions} rel="noopener noreferrer"
		>Google account permissions</a
	>), and your portfolio address becomes available to others. What stays: skill names in the shared
	catalogue (they are not linked to anyone), step suggestions already published on GitHub, the
	meeting slots you reserved as a guest of other portfolios (until the slot ends), the abuse and
	quota counters (keyed hashes, deleted at the end of their window, at most 30 days; the quotas you
	used are carried over to a hash of your Google account identifier, as described above), and logs
	until they expire.
</p>

<h3 id="rights">Your rights</h3>
<p>Wherever you live, you can:</p>
<ul>
	<li><strong>access</strong> your data and get a copy of it;</li>
	<li>
		<strong>rectify</strong> it: you edit your portfolio and job descriptions yourself; your email address
		is the one of your Google account;
	</li>
	<li>
		<strong>erase</strong> it: delete your account yourself from
		<a class="link-text" href={resolve('/(site)/account')}>your account page</a>, or ask us;
	</li>
	<li><strong>restrict</strong> its processing;</li>
	<li>
		<strong>object</strong> to processing based on our legitimate interest, for reasons relating to your
		situation;
	</li>
	<li>
		<strong>receive</strong> the data you gave us in a structured, machine-readable format (portability):
		we send it as JSON on request.
	</li>
</ul>
<p>
	Write to <ContactEmail {publisher} {lang} />, from the email address of your account if you can,
	so that we can check the request is yours. We answer within one month; when a request is complex,
	this can be extended by two more months and we tell you why.
</p>
<p>
	You can also lodge a complaint with a data protection authority, in particular where you live or
	work. In France: {CNIL.name}, {CNIL.address},
	<a class="link-text" href={CNIL.website} rel="noopener noreferrer">www.cnil.fr</a>
	(<a class="link-text" href={CNIL.complaint} rel="noopener noreferrer" hreflang="fr"
		>online complaint</a
	>).
</p>

<h3 id="required">What you have to provide</h3>
<p>
	A Google account is needed to sign in: without it you can read portfolios and job descriptions,
	but not create a portfolio, apply or publish. Booking a meeting needs your name and email address,
	which the portfolio owner needs to meet you. Everything else, including the résumé import, is
	optional.
</p>

<h3 id="ai">AI and automated decisions</h3>
<p>
	The résumé and job description imports use Claude, an AI model made by Anthropic. Its drafts can
	be incomplete or wrong: you review and edit them, and nothing is published until you add it. No
	decision with legal or similarly significant effects on you is made by automated means: the site
	does not score, rank or filter candidates, and recruiters see applications as they are.
</p>
<p>
	A hiring journey can score the job description a recruiter picks against the owner's perfect job,
	and open its next steps only from a minimum the owner set. The score is computed by fixed rules,
	not by an AI model, and it is about the job description, not about a person: the recruiter can
	complete it, pick another one, or reach the owner another way.
</p>

<h3 id="children">Children</h3>
<p>
	The site is not intended for anyone under {MINIMUM_AGE} or below the minimum legal working age of their
	country. Confirming it is required when you sign up from the home page or claim a portfolio, and using
	an account means you meet these conditions. If we learn that an account belongs to someone younger,
	we delete it. Parents and guardians can write to us at
	<ContactEmail {publisher} {lang} /> to have it deleted.
</p>

<h3 id="security">Security</h3>
<p>
	Connections use HTTPS. The session cookie cannot be read by scripts on the page. Google Calendar
	tokens are never returned by the API or written to logs. IP and email addresses used against abuse
	are hashed with a secret key. Cookies, authorisation headers, query strings and request bodies are
	removed from traces. If a personal data breach is likely to put you at risk, we notify the CNIL
	within 72 hours and tell you without delay when the risk is high.
</p>

<h3 id="cookies">Cookies and local storage</h3>
<p>
	The site sets two cookies of its own, one which keeps you signed in and one which remembers the
	language you chose, and uses your browser's storage for preferences and unsaved drafts. Google's
	sign-in is loaded only when you ask for it; it then sets its cookie <code>g_state</code> on this
	site's domain and its own cookies on accounts.google.com. There is no analytics or advertising
	cookie, so no consent banner is needed. The full list is on the
	<LegalDocLink doc="cookies" {lang}>cookies and local storage</LegalDocLink> page.
</p>

<h3 id="tracking">Do Not Track, tracking and sale of data</h3>
<p>
	The site does not track you across other sites and uses no analytics or advertising. It therefore
	treats every visitor the same, whether or not their browser sends a Do Not Track or Global Privacy
	Control signal.
</p>
<p>
	No third party collects information about your activity on this site over time and across sites on
	our behalf. Two kinds of third parties can still receive information when you browse it. Google,
	whose sign-in script is loaded when you ask for it (clicking a sign-in button, ticking the age and
	terms box, connecting Google Calendar, signing out or deleting your account): Google then receives
	your IP address and browser details and may read or set its cookies, under the
	<a class="link-text" href={LINKS.googlePrivacy} rel="noopener noreferrer">Google privacy policy</a
	>. And the sites hosting images that a portfolio's owner shows in their descriptions: your browser
	loads them from those sites, which receive your IP address and browser details.
</p>
<p>
	We do not sell or share personal information, and we do not use it for targeted advertising. We do
	not knowingly collect sensitive personal information: please do not publish health data, identity
	numbers or similar information in your portfolio.
</p>

<h3 id="google">Google user data</h3>
<p class="legal-callout">
	{SITE_NAME}'s use and transfer to any other app of information received from Google APIs will
	adhere to the
	<a class="link-text" href={LINKS.googleApiPolicy} rel="noopener noreferrer"
		>Google API Services User Data Policy</a
	>, including the Limited Use requirements.
</p>
<ul>
	<li>
		<strong>Sign in with Google</strong>: we receive your Google account identifier, email address,
		name and picture in a signed token, and keep only the identifier and the email address, to
		create your account and sign you in.
	</li>
	<li>
		<strong>Google Calendar</strong>, only for portfolio owners who connect it: the site asks for
		the scope <code>{GOOGLE_CALENDAR_SCOPE}</code> and uses it only to list your calendars so you pick
		the one for meetings, read the busy times of that calendar (not the content of your events) to show
		the free slots, create the event of each booking (with a Google Meet link if you chose one) and send
		its invitation, and list and cancel the events booked through this site.
	</li>
	<li>
		Data received from Google is not used for advertising, not sold, not transferred to data
		brokers, not sent to Anthropic or any other AI model and not used to train AI models. Nobody
		reads it except with your permission, for security reasons or to comply with the law.
	</li>
	<li>
		The Calendar tokens are stored in our database so that a booking works while you are away; they
		are never returned by the API or logged. Disconnecting Google Calendar (Admin, Appointments,
		Disconnect) or deleting your account deletes them, and we ask Google to revoke the access; if
		Google cannot be reached at that moment, the access may stay listed in your Google account until
		you remove it there. You can check or revoke it at any time from your
		<a class="link-text" href={LINKS.googlePermissions} rel="noopener noreferrer"
			>Google account permissions</a
		>.
	</li>
</ul>

<h3 id="changes">Changes to this policy</h3>
<p>
	When we change this policy materially, we update its date and version, tell you on the site or by
	email before the change applies, and ask you to accept the new terms when you next sign up or
	claim a portfolio, or from your account page. This version applies since {legalLastUpdated(lang)}.
</p>
