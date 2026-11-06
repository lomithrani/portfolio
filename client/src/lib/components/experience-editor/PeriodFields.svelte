<script lang="ts">
	import MonthInput from './MonthInput.svelte';
	import FieldError from './FieldError.svelte';
	import { getEditorContext } from './context';

	let {
		start = $bindable(''),
		end = $bindable(''),
		ongoing = $bindable(false),
		ongoingLabel,
		/** '' for the experience, 'projects.<id>.' for a project */
		fieldPrefix = ''
	}: {
		start?: string;
		end?: string;
		ongoing?: boolean;
		ongoingLabel: string;
		fieldPrefix?: string;
	} = $props();

	const editor = getEditorContext();
	const startField = $derived(`${fieldPrefix}start`);
	const endField = $derived(`${fieldPrefix}end`);
	const ongoingId = $derived(`${editor.fieldId(endField)}-ongoing`);

	const describedby = (field: string) => (editor.error(field) ? editor.errorId(field) : undefined);
</script>

<div class="grid gap-x-4 gap-y-3 sm:grid-cols-2">
	<div class="space-y-1">
		<MonthInput
			bind:value={start}
			id={editor.fieldId(startField)}
			label="Start"
			invalid={!!editor.error(startField)}
			describedby={describedby(startField)}
		/>
		<FieldError field={startField} />
	</div>
	<div class="space-y-1">
		<MonthInput
			bind:value={end}
			id={editor.fieldId(endField)}
			label="End"
			disabled={ongoing}
			invalid={!!editor.error(endField)}
			describedby={describedby(endField)}
		/>
		<label for={ongoingId} class="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
			<input
				id={ongoingId}
				type="checkbox"
				class="checkbox"
				bind:checked={ongoing}
				onchange={() => {
					// Ongoing means no end month
					if (ongoing) end = '';
				}}
			/>
			<span>{ongoingLabel}</span>
		</label>
		<FieldError field={endField} />
	</div>
</div>
