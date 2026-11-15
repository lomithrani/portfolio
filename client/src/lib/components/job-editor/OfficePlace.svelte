<!--
@component
Under the office's address in the job editor: where the map service finds it (GET
/addresses/office), which is where a candidate's travel time will be counted to. The street,
the town when the street is not found (said as a warning: the address is probably mistyped), or
nowhere. Looked up for the office as the recruiter last left it (`asked`), shown while the
fields still hold it; nothing on a site that looks no address up.
-->
<script lang="ts">
	import { CheckCircle, ExclamationTriangle, MapPin } from 'svelte-heros-v2';
	import type { OfficePlace } from 'portfolio-common';
	import { lookUpOffice, officeKey, type OfficeAddress } from '#services/addressSearch.ts';
	import { m } from './OfficePlace.messages.ts';

	let {
		asked,
		current,
		picked = null
	}: {
		/** The office as the recruiter last left it: what is looked up */
		asked: OfficeAddress;
		/** The office as the fields hold it now */
		current: OfficeAddress;
		/** An address picked in the search's list: found already, nothing is asked for it */
		picked?: { key: string; place: OfficePlace } | null;
	} = $props();

	let found = $state.raw<{ key: string; place: OfficePlace } | null>(null);

	$effect(() => {
		const office = asked;
		const key = officeKey(office);
		if (picked?.key === key) {
			found = picked;
			return;
		}
		if (!office.address.trim() && !office.city.trim()) {
			found = null;
			return;
		}
		const request = new AbortController();
		void lookUpOffice(office, request.signal).then((place) => {
			if (!request.signal.aborted) found = place && { key, place };
		});
		return () => request.abort();
	});

	let place = $derived(found?.key === officeKey(current) ? found.place : null);
	let streetTyped = $derived(current.address.trim() !== '');
</script>

<!-- Always in the page: a status must be there before its text changes to be announced -->
<p class="text-xs" role="status" data-office-place data-found={place?.found}>
	{#if place?.found === 'street'}
		<span class="flex items-start gap-1.5 text-success-800-200">
			<CheckCircle size="16" class="mt-px shrink-0" aria-hidden="true" />
			{m.street(place.label ?? '')}
		</span>
	{:else if place?.found === 'town' && streetTyped}
		<span class="flex items-start gap-1.5 text-warning-800-200">
			<ExclamationTriangle size="16" class="mt-px shrink-0" aria-hidden="true" />
			{m.streetNotFound(place.label ?? '')}
		</span>
	{:else if place?.found === 'town'}
		<span class="flex items-start gap-1.5 text-surface-700-300">
			<MapPin size="16" class="mt-px shrink-0" aria-hidden="true" />
			{m.town(place.label ?? '')}
		</span>
	{:else if place?.found === 'none'}
		<span class="flex items-start gap-1.5 text-warning-800-200">
			<ExclamationTriangle size="16" class="mt-px shrink-0" aria-hidden="true" />
			{m.none}
		</span>
	{/if}
</p>
