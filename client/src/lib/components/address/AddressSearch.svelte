<!--
@component
A text field for an address that searches as it is typed: after a pause, what was typed is
answered with the addresses the map service knows (GET /addresses/search), in a list under the
field. Picking one puts it in the field as the map service writes it, so the address kept is
one it finds again. The field stays a plain text field: what is typed is kept as typed when
nothing is picked, and on a site that looks no address up it never shows a list.

A combobox (ARIA): the arrows move in the list, Enter picks, Escape closes it. The attributes
given (`id`, `aria-describedby`, `aria-invalid`...) go on the input.
-->
<script lang="ts" module>
	/** Whether this site searches addresses at all: asked once for the page */
	let searchOff = false;
</script>

<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { MapPin } from 'svelte-heros-v2';
	import type { AddressSuggestion } from 'portfolio-common';
	import { addressSearchParams, searchAddresses } from '#services/addressSearch.ts';
	import { m } from './AddressSearch.messages.ts';

	let {
		value = $bindable(''),
		id,
		near,
		onpick,
		class: className = 'input',
		...rest
	}: Omit<HTMLInputAttributes, 'value' | 'id' | 'class' | 'type' | 'role'> & {
		value?: string;
		/** Unique in the page: the input's id */
		id: string;
		/** A postal code and a town typed in fields of their own: they narrow the search */
		near?: { postalCode?: string; city?: string };
		/**
		 * Called with the address picked, to put it in the form; without it, the field takes the
		 * address as the map service writes it
		 */
		onpick?: (suggestion: AddressSuggestion) => void;
		class?: string;
	} = $props();

	/** A pause in typing this long sends what was typed */
	const SEARCH_DELAY_MS = 300;

	let suggestions = $state.raw<AddressSuggestion[]>([]);
	/** What the list says instead of addresses: nothing found, or no search right now */
	let notice = $state<'none' | 'unavailable' | null>(null);
	let open = $state(false);
	/** The suggestion the arrows are on; -1: none */
	let active = $state(-1);
	/**
	 * The arrows were on an address that a newer answer no longer has: Enter then does nothing,
	 * rather than send the form around the field the person was choosing in
	 */
	let lost = false;
	/** Announced to screen readers */
	let announcement = $state('');
	let list: HTMLDivElement | undefined = $state();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let request: AbortController | undefined;

	const listId = $derived(`${id}-suggestions`);
	const optionId = (index: number) => `${id}-suggestion-${index}`;

	function cancel() {
		clearTimeout(timer);
		request?.abort();
		request = undefined;
	}

	function close() {
		open = false;
		active = -1;
		lost = false;
		// Emptied: the next list is announced even when its sentence is the same
		announcement = '';
	}

	/** Searches for what is in the field, after a pause; a search under way is dropped */
	function search() {
		cancel();
		lost = false;
		const query = { text: value, ...near };
		if (searchOff || !addressSearchParams(query)) {
			suggestions = [];
			notice = null;
			close();
			return;
		}
		timer = setTimeout(async () => {
			const mine = new AbortController();
			request = mine;
			const outcome = await searchAddresses(query, mine.signal);
			// Typed on since, or the field was left: this answer is for another text
			if (mine.signal.aborted) return;
			request = undefined;
			// The arrows may already be on an address of the list still open: they stay on it
			const kept = open && active >= 0 ? suggestions[active]?.label : undefined;
			if (outcome.status === 'off') {
				searchOff = true;
				suggestions = [];
				notice = null;
				close();
				return;
			}
			suggestions = outcome.status === 'found' ? outcome.suggestions : [];
			active = kept === undefined ? -1 : suggestions.findIndex(({ label }) => label === kept);
			lost = kept !== undefined && active < 0;
			notice =
				outcome.status === 'unavailable' ? 'unavailable' : suggestions.length === 0 ? 'none' : null;
			open = true;
			announcement = notice ? m[notice] : m.found(suggestions.length);
			// The whole list in sight, above what the page keeps at its bottom (its scroll padding)
			await tick();
			list?.scrollIntoView({ block: 'nearest' });
		}, SEARCH_DELAY_MS);
	}

	function pick(suggestion: AddressSuggestion) {
		cancel();
		if (onpick) onpick(suggestion);
		// A town's label carries its postal code (the API's): it finds that town again
		else value = suggestion.label;
		suggestions = [];
		notice = null;
		close();
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.isComposing) return;
		if (event.key === 'Escape') {
			// A search waiting for the pause in typing is dropped too: no list opens after Escape
			cancel();
			// No list: the key is the dialog's or the form's around the field
			if (!open) return;
			// Only the list closes
			event.preventDefault();
			event.stopPropagation();
			close();
			return;
		}
		if (suggestions.length === 0) return;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (!open) {
				open = true;
				active = event.key === 'ArrowDown' ? 0 : suggestions.length - 1;
				return;
			}
			lost = false;
			const step = event.key === 'ArrowDown' ? 1 : -1;
			// From the last one, back to the field (none), then round again
			active = ((active + 1 + step + suggestions.length + 1) % (suggestions.length + 1)) - 1;
		} else if (event.key === 'Enter' && open && active >= 0) {
			// Picks the address: does not send the form
			event.preventDefault();
			pick(suggestions[active]);
		} else if (event.key === 'Enter' && open && lost) {
			// The address the arrows were on is gone from the list: nothing is picked or sent
			event.preventDefault();
		}
	}

	/** The line of a suggestion: the street (or the town), then where it is */
	const lines = (suggestion: AddressSuggestion): { main: string; where: string } =>
		suggestion.kind === 'municipality' || !suggestion.street
			? { main: suggestion.city ?? suggestion.label, where: suggestion.postalCode ?? '' }
			: {
					main: suggestion.street,
					where: [suggestion.postalCode, suggestion.city].filter(Boolean).join(' ')
				};

	onDestroy(cancel);
</script>

<div class="relative">
	<input
		{...rest}
		{id}
		class={className}
		type="text"
		role="combobox"
		aria-autocomplete="list"
		aria-expanded={open && suggestions.length > 0}
		aria-controls={listId}
		aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
		bind:value
		oninput={search}
		{onkeydown}
		onblur={() => {
			cancel();
			close();
		}}
	/>
	<!-- Always in the page, as aria-controls names it; empty while closed -->
	<div
		bind:this={list}
		class={[
			'absolute inset-x-0 top-full z-20 mt-1 overflow-hidden card border border-surface-300-700 bg-surface-50-950 shadow-lg',
			!open && 'hidden'
		]}
		data-address-suggestions
	>
		<!-- Hidden while it has no address: a list without options is not one to announce -->
		<ul
			id={listId}
			role="listbox"
			aria-label={m.suggestions}
			class={['max-h-72 overflow-y-auto', suggestions.length === 0 && 'hidden']}
		>
			{#each open ? suggestions : [] as suggestion, index (suggestion.label)}
				{@const line = lines(suggestion)}
				<!-- The keyboard picks from the field (the arrows, Enter); this is for the pointer, which
				     does not move the arrows' place: a list opening under a resting pointer must not
				     make Enter pick the address under it -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
					id={optionId(index)}
					role="option"
					tabindex="-1"
					aria-selected={index === active}
					class={[
						'flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-sm',
						index === active ? 'preset-tonal-primary' : 'hover:preset-tonal'
					]}
					onpointerdown={(event) => event.preventDefault()}
					onclick={() => pick(suggestion)}
				>
					<MapPin size="16" class="shrink-0 opacity-60" aria-hidden="true" />
					<span class="min-w-0 break-words">
						{line.main}
						{#if line.where}
							<span class="text-surface-700-300">{line.where}</span>
						{/if}
					</span>
				</li>
			{/each}
		</ul>
		{#if open && notice}
			<p class="px-3 py-2 text-sm text-surface-700-300" data-address-notice>{m[notice]}</p>
		{:else if open}
			<p class="border-t border-surface-200-800 px-3 py-1.5 text-xs text-surface-700-300">
				{m.source}
			</p>
		{/if}
	</div>
	<p class="sr-only" role="status">{announcement}</p>
</div>
