<!--
@component
A set of choices of a perfect job criterion (work modes, contracts, seniority levels): one
checkbox each, any number picked. The value keeps the order of the options, whatever the order
they were ticked in.
-->
<script lang="ts" generics="T extends string">
	let {
		legend,
		options,
		labels,
		value = $bindable([]),
		unavailable = [],
		error = '',
		disabled = false,
		id
	}: {
		legend: string;
		options: readonly T[];
		labels: Record<T, string>;
		value?: T[];
		/** Options that cannot be picked here (a ticked one can still be unticked), and are said so */
		unavailable?: readonly T[];
		/** What is wrong with the choice, shown under it */
		error?: string;
		disabled?: boolean;
		/** Unique in the page */
		id: string;
	} = $props();

	const toggle = (option: T, checked: boolean) => {
		value = options.filter((item) => (item === option ? checked : value.includes(item)));
	};
</script>

<fieldset class="space-y-1.5" {disabled} aria-describedby={error ? `${id}-error` : undefined}>
	<legend class="label-text text-sm">{legend}</legend>
	<div class="flex flex-wrap gap-x-5 gap-y-2">
		{#each options as option (option)}
			<label class="flex min-h-8 items-center gap-2 text-sm">
				<input
					class="checkbox"
					type="checkbox"
					checked={value.includes(option)}
					disabled={unavailable.includes(option) && !value.includes(option)}
					onchange={(event) => toggle(option, event.currentTarget.checked)}
				/>
				{labels[option]}
				{#if unavailable.includes(option)}
					<span class="text-xs text-surface-700-300">(not available on this site)</span>
				{/if}
			</label>
		{/each}
	</div>
	{#if error}
		<p class="text-sm text-error-700-300" id="{id}-error">{error}</p>
	{/if}
</fieldset>
