<!--
@component
Where the recruiter space is opened by an account that already accepted the terms in force (so no
age and terms checkbox shows): one line saying what the Terms of use ask of recruiters, linking to
that section (#recruiters, in a new tab, so the form keeps its state). AgeTermsConsent says the same
in its notice (`recruiter`) when the box shows.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import Rich from '#lib/i18n/Rich.svelte';
	import { m } from './legal.messages.ts';

	let { class: className = '' }: { class?: string } = $props();
</script>

<p class={['text-xs text-surface-700-300', className]}>
	<Rich text={m.recruiterRules}>
		{#snippet recruiters(text: string)}<a
				class="link-text"
				href="{resolve('/(site)/legal/terms')}#recruiters"
				target="_blank"
				rel="noopener noreferrer">{text}<span class="sr-only">{` ${m.consent.newTab}`}</span></a
			>{/snippet}
	</Rich>
</p>
