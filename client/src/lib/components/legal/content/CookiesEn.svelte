<!--
@component
Cookies and local storage (English): the session cookie, the language cookie, Google Identity
Services cookies, each
localStorage key with its purpose and lifetime, why there is no consent banner (ePrivacy art. 5(3),
French loi Informatique et Libertés art. 82), how to clear them.
-->
<script module lang="ts">
	import type { LegalSection } from '../legalDocuments.ts';

	export const sections: readonly LegalSection[] = [
		{ id: 'summary', title: 'In short' },
		{ id: 'cookies', title: 'Cookies' },
		{ id: 'local-storage', title: 'Local storage' },
		{ id: 'control', title: 'How to delete them' }
	];
</script>

<script lang="ts">
	import LegalDocLink from '../LegalDocLink.svelte';
	import { SITE_NAME } from '../legalDocuments.ts';
	import { LANGUAGE_COOKIE_DAYS, LINKS, SESSION_DAYS } from './facts.ts';

	const lang = 'en';
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- the links left are external sites, mailto: and in-page anchors (facts.ts); the site's pages go through resolve() (LegalDocLink) -->
<h3 id="summary">In short</h3>
<p>
	{SITE_NAME} sets <strong>two cookies of its own</strong>, one which keeps you signed in and one
	which remembers the language you chose, and uses your browser's <strong>local storage</strong> for
	your theme and your unsaved drafts. There is no analytics, no advertising and no social media
	tracker. Google's sign-in is loaded only when you ask for it (for example by clicking "Sign in");
	it then sets its own cookie <code>g_state</code> on this site's domain and its cookies on accounts.google.com,
	under Google's policy. Everything listed here is strictly necessary for a service you ask for, which
	is why the site does not ask for your consent with a banner (article 5(3) of the ePrivacy Directive,
	article 82 of the French loi Informatique et Libertés). The descriptions of a portfolio can also show
	images hosted on other sites, chosen by its owner: your browser loads them from those sites, which receive
	your IP address and browser details and apply their own rules.
</p>

<h3 id="cookies">Cookies</h3>
<div class="legal-table legal-table-wide">
	<table>
		<thead>
			<tr>
				<th scope="col">Name</th>
				<th scope="col">Set by</th>
				<th scope="col">Purpose</th>
				<th scope="col">Duration</th>
			</tr>
		</thead>
		<tbody>
			<tr>
				<td><code>auth</code></td>
				<td>This site's API</td>
				<td>
					Keeps you signed in: a signed token with your account identifier and its expiry date. It
					cannot be read by scripts on the page (HttpOnly), is sent over HTTPS only (Secure) and
					only with this site's own requests (SameSite). Strictly necessary.
				</td>
				<td>{SESSION_DAYS} days, or until you sign out</td>
			</tr>
			<tr>
				<td><code>lang</code></td>
				<td>This site</td>
				<td>
					Remembers the language you chose (<code>en</code> or <code>fr</code>, nothing else), so
					the pages open in it. Set only when you choose a language, with the language switch or a
					link that asks for one (<code>?lang=fr</code>); until then the pages follow your browser's
					language and no cookie is set. A link from elsewhere never replaces the language you
					chose. It cannot be read by scripts on the page (HttpOnly). Strictly necessary for a
					setting you ask for.
				</td>
				<td>{LANGUAGE_COOKIE_DAYS} days, renewed each time you choose</td>
			</tr>
			<tr>
				<td><code>g_state</code></td>
				<td>Google Identity Services, on this site's domain</td>
				<td>
					Remembers your choices in Google's sign-in prompt, such as closing it or turning off
					automatic sign-in after you sign out. Part of the Google sign-in.
				</td>
				<td>Set by Google</td>
			</tr>
			<tr>
				<td>Google's cookies</td>
				<td>Google, on its own domains (accounts.google.com)</td>
				<td>
					Your Google session and Google's security, read and set inside Google's sign-in button and
					window.
				</td>
				<td>
					See the <a class="link-text" href={LINKS.googlePrivacy} rel="noopener noreferrer"
						>Google privacy policy</a
					>
				</td>
			</tr>
		</tbody>
	</table>
</div>
<p>
	<strong>When Google is involved.</strong> Google's sign-in script is loaded only after you ask for something
	that needs it: clicking a "Sign in" or "Sign in with Google" button (in the header of portfolios, job
	pages and the recruiter space, in the apply panel of a job page or in a hiring journey), ticking the
	age and terms box on the home page or in a claim form, connecting Google Calendar, and also signing
	out or deleting your account, to turn off Google's automatic sign-in on this browser (otherwise Google
	would sign you straight back in). Loading it sends your IP address and browser details to Google, even
	if you do not sign in. Once loaded, it stays loaded until you leave or reload the site, including on
	the pages you open next, such as the legal pages.
</p>

<h3 id="local-storage">Local storage</h3>
<p>
	This data stays in your browser: it is not sent to us until you save. In the keys below,
	<code>&lt;account&gt;</code> is your account identifier and <code>&lt;portfolio&gt;</code> the address
	of the portfolio.
</p>
<div class="legal-table legal-table-wide">
	<table>
		<thead>
			<tr>
				<th scope="col">Key</th>
				<th scope="col">Purpose</th>
				<th scope="col">Lifetime</th>
			</tr>
		</thead>
		<tbody>
			<tr>
				<td><code>authenticationStore</code></td>
				<td>
					A copy of your session for the pages: account identifier, email address, chosen space,
					recruiter space, portfolio address, version of the terms you accepted and session expiry
				</td>
				<td>Removed when you sign out or when the session ends</td>
			</tr>
			<tr>
				<td><code>portfolio-dark-mode</code></td>
				<td>Your choice of light or dark theme</td>
				<td>Until you clear it</td>
			</tr>
			<tr>
				<td><code>experienceDraft:&lt;account&gt;:&lt;portfolio&gt;:…</code></td>
				<td>Unsaved changes in the experience editor, so a reload does not lose them</td>
				<td>Until you save or discard them</td>
			</tr>
			<tr>
				<td><code>resumeImport:&lt;account&gt;:&lt;portfolio&gt;</code></td>
				<td>
					The drafts read from your résumé while you review them, so a reload does not lose an
					import
				</td>
				<td>Until every draft is added or discarded</td>
			</tr>
			<tr>
				<td><code>jobDraft:&lt;account&gt;:…</code></td>
				<td>Unsaved job descriptions in the job editor</td>
				<td>Until you save or discard them</td>
			</tr>
			<tr>
				<td><code>jobImportDraft:&lt;account&gt;</code></td>
				<td>The last draft read from a job description PDF</td>
				<td>Until you use or discard it</td>
			</tr>
		</tbody>
	</table>
</div>
<p>
	Drafts stay in the browser after you sign out. On a shared computer, discard them or clear the
	site's data. Deleting your account removes the drafts of that account from the browser you delete
	it from.
</p>

<h3 id="control">How to delete them</h3>
<ul>
	<li>Signing out deletes the session cookie and the copy of your session.</li>
	<li>
		Your browser's settings let you delete this site's cookies and storage ("site data"), or block
		them. Blocking the <code>auth</code> cookie prevents signing in; reading portfolios and job
		descriptions still works. Without the <code>lang</code> cookie the pages follow your browser's language.
	</li>
	<li>
		Google's cookies are managed in your browser and your Google account, under the
		<a class="link-text" href={LINKS.googlePrivacy} rel="noopener noreferrer"
			>Google privacy policy</a
		>.
	</li>
</ul>
<p>
	More about how your data is processed: <LegalDocLink doc="privacy" {lang}
		>privacy policy</LegalDocLink
	>.
</p>
