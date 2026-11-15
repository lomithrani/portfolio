<!--
@component
The meeting step of a portfolio's hiring journey: the booking of MeetingBooking.svelte, started
with the signed-in visitor's name and email. Nothing is submitted on the step: the booking routes
check that it is open, and the API records the booking on it.
-->
<script lang="ts">
	import { isSessionValid } from '#services/authentication.ts';
	import { authenticationStore } from '#services/stores/index.ts';
	import MeetingBooking from '#components/hire/MeetingBooking.svelte';
	import type { StepProps } from './types';

	let { domainName, ownerName, locked, succeeded }: StepProps = $props();

	// What the booking form starts with: the session's name and email, when there is one
	let prefill = $derived.by(() => {
		const account = isSessionValid($authenticationStore) ? $authenticationStore.user : undefined;
		const name = [account?.name, account?.surname].filter(Boolean).join(' ');
		return { name, email: account?.email ?? '' };
	});
</script>

<MeetingBooking {domainName} {ownerName} {prefill} onBooked={succeeded} onLocked={locked} />
