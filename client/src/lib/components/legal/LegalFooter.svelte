<!--
@component
The footer of the site's own pages (the landing page, the legal pages, the account page): the site's
links (the job board, the recruiter space: these pages have no other way there for a visitor who is
not signed in) and the light/dark switch, then the links to the legal notice, the privacy policy,
the terms of use and the cookies page, and the copyright line. `lang`: the language of the links
(the French legal pages pass 'fr').
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import ThemeToggle from '#components/ThemeToggle.svelte';
	import LegalLinks from './LegalLinks.svelte';
	import { SITE_NAME, type LegalLanguage } from './legalDocuments.ts';

	let { lang = 'en' }: { lang?: LegalLanguage } = $props();

	const year = new Date().getFullYear();

	const linkClass =
		'text-surface-700-300 underline-offset-4 hover:text-surface-950-50 hover:underline focus-visible:underline';
</script>

<footer class="border-t border-surface-200-800 bg-surface-50-950 px-4 py-6 md:px-6">
	<div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
		<div class="flex items-center justify-between gap-4">
			<nav aria-label="Site" lang={lang === 'fr' ? 'fr' : undefined}>
				<ul class="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium">
					<li>
						<a href={resolve('/(app)/jobs')} class={linkClass}
							>{lang === 'fr' ? "Offres d'emploi" : 'Browse jobs'}</a
						>
					</li>
					<li>
						<a href={resolve('/(app)/recruiter')} class={linkClass}
							>{lang === 'fr' ? 'Pour les recruteurs' : 'For recruiters'}</a
						>
					</li>
				</ul>
			</nav>
			<ThemeToggle />
		</div>
		<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<LegalLinks {lang} />
			<p class="text-sm text-surface-700-300">© {year} {SITE_NAME}</p>
		</div>
	</div>
</footer>
