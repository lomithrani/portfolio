<!--
@component
The footer of the site's own pages (the landing page, the legal pages, the account page): the site's
links (the recruiter space: these pages have no other way there for a visitor who is not signed in;
"Send feedback" for a signed-in account), the language switch and the light/dark switch, then the
links to the legal notice, the privacy policy, the terms of use and the cookies page, and the
copyright line.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import ThemeToggle from '#components/ThemeToggle.svelte';
	import LanguageSwitch from '#lib/i18n/LanguageSwitch.svelte';
	import FeedbackButton from '#components/feedback/FeedbackButton.svelte';
	import LegalLinks from './LegalLinks.svelte';
	import { SITE_NAME } from './legalDocuments.ts';
	import { m } from './legal.messages.ts';

	const year = new Date().getFullYear();

	const linkClass =
		'text-surface-700-300 underline-offset-4 hover:text-surface-950-50 hover:underline focus-visible:underline';
</script>

<footer class="border-t border-surface-200-800 bg-surface-50-950 px-4 py-6 md:px-6">
	<div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
		<div class="flex items-center justify-between gap-4">
			<nav aria-label={m.footer.label}>
				<ul class="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium">
					<li>
						<a href={resolve('/(app)/recruiter')} class={linkClass}>{m.footer.recruiters}</a>
					</li>
					<!-- Signed in, and the server takes feedback: nothing otherwise -->
					<li class="empty:hidden"><FeedbackButton /></li>
				</ul>
			</nav>
			<div class="flex shrink-0 items-center gap-2">
				<LanguageSwitch />
				<ThemeToggle />
			</div>
		</div>
		<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<LegalLinks />
			<p class="text-sm text-surface-700-300">© {year} {SITE_NAME}</p>
		</div>
	</div>
</footer>
