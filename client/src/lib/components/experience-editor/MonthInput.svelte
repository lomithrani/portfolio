<script lang="ts">
	// A month picker that works in every browser (no <input type="month">): a month and a year
	// select. The value is 'YYYY-MM', '' when empty, or half-filled ('YYYY-' / '-MM') while only
	// one of the two is chosen, which the form validation reports.

	const MONTHS = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	];
	const FIRST_YEAR = 1950;

	let {
		value = $bindable(''),
		id,
		label,
		disabled = false,
		invalid = false,
		describedby
	}: {
		value?: string;
		/** Id of the month select (what a label or an error link focuses) */
		id: string;
		label: string;
		disabled?: boolean;
		invalid?: boolean;
		describedby?: string;
	} = $props();

	let year = $derived(value.split('-')[0] ?? '');
	let month = $derived(value.split('-')[1] ?? '');

	const lastYear = new Date().getUTCFullYear() + 5;
	let years = $derived.by(() => {
		const list: string[] = [];
		for (let y = lastYear; y >= FIRST_YEAR; y--) list.push(String(y));
		// Keep a stored year outside the range selectable
		if (/^\d{4}$/.test(year) && !list.includes(year)) list.push(year);
		return list;
	});

	const set = (nextYear: string, nextMonth: string) => {
		value = nextYear || nextMonth ? `${nextYear}-${nextMonth}` : '';
	};
</script>

<fieldset class="min-w-0" {disabled}>
	<legend class="label-text mb-1">{label}</legend>
	<div class="flex gap-2">
		<select
			{id}
			class="select min-w-0 flex-1 ps-2"
			aria-label="{label} month"
			aria-invalid={invalid || undefined}
			aria-describedby={describedby}
			value={month}
			onchange={(event) => set(year, event.currentTarget.value)}
		>
			<option value="">Month</option>
			{#each MONTHS as name, index (name)}
				<option value={String(index + 1).padStart(2, '0')}>{name}</option>
			{/each}
		</select>
		<select
			class="select w-26 shrink-0 ps-2"
			aria-label="{label} year"
			aria-invalid={invalid || undefined}
			aria-describedby={describedby}
			value={year}
			onchange={(event) => set(event.currentTarget.value, month)}
		>
			<option value="">Year</option>
			{#each years as option (option)}
				<option value={option}>{option}</option>
			{/each}
		</select>
	</div>
</fieldset>
