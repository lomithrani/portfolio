<!--
@component
A job description's status: what it means now, and a menu to change it (Draft, Open, On hold,
Filled, Closed, each with what it means for the public page). Choosing one calls `onChange`: the
page sends PUT /jobs/:id/status (`busy` meanwhile) and passes the new status back. A menu, not
radio buttons: moving through the choices with the arrow keys changes nothing until one is picked.
-->
<script lang="ts">
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import { ArrowPath, Check, ChevronDown, InformationCircle } from 'svelte-heros-v2';
	import { JOB_STATUSES, type JobStatus } from 'portfolio-common';
	import { JOB_STATUS_DESCRIPTIONS, statusLabel } from '#services/jobPosting.ts';
	import JobStatusBadge from '#components/jobs/JobStatusBadge.svelte';

	let {
		status,
		busy = false,
		onChange
	}: {
		status: JobStatus;
		/** The new status is being saved */
		busy?: boolean;
		onChange: (status: JobStatus) => void;
	} = $props();

	const uid = $props.id();
	let open = $state(false);

	const itemClass =
		'items-start gap-3 py-2 cursor-pointer data-[state=checked]:bg-primary-500/10 text-start';
</script>

<section
	class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-3 p-4"
	aria-labelledby="{uid}-title"
>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h3 id="{uid}-title" class="font-semibold">Status</h3>
		<JobStatusBadge {status} />
	</div>
	<p class="text-sm text-surface-700-300">{JOB_STATUS_DESCRIPTIONS[status]}</p>

	<Menu
		{open}
		onOpenChange={(details) => (open = details.open && !busy)}
		onSelect={({ value }) => {
			if (!busy && value !== status) onChange(value as JobStatus);
		}}
		positioning={{ placement: 'bottom-start', gutter: 6, sameWidth: false }}
	>
		<Menu.Trigger
			class="btn w-full justify-between preset-tonal min-h-10"
			aria-busy={busy ? 'true' : undefined}
			aria-disabled={busy ? 'true' : undefined}
		>
			{#if busy}
				<span class="flex items-center gap-2">
					<ArrowPath size="16" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
					Saving…
				</span>
			{:else}
				<span>Change status</span>
				<ChevronDown size="16" aria-hidden="true" />
			{/if}
		</Menu.Trigger>
		<Portal>
			<Menu.Positioner class="z-50">
				<Menu.Content class="w-80 max-w-[calc(100vw-1rem)] text-surface-950-50 outline-none">
					<Menu.ItemGroup>
						<Menu.ItemGroupLabel>Status</Menu.ItemGroupLabel>
						{#each JOB_STATUSES as option (option)}
							<Menu.OptionItem
								type="radio"
								value={option}
								valueText={statusLabel(option)}
								checked={option === status}
								class={itemClass}
							>
								<Menu.ItemText class="min-w-0 flex-1">
									<span class="block font-medium">{statusLabel(option)}</span>
									<span class="block text-xs text-surface-700-300">
										{JOB_STATUS_DESCRIPTIONS[option]}
									</span>
								</Menu.ItemText>
								<Menu.ItemIndicator class="mt-0.5 text-primary-700-300">
									<Check size="16" aria-hidden="true" />
								</Menu.ItemIndicator>
							</Menu.OptionItem>
						{/each}
					</Menu.ItemGroup>
				</Menu.Content>
			</Menu.Positioner>
		</Portal>
	</Menu>

	<p class="flex items-start gap-1.5 text-xs text-surface-700-300">
		<InformationCircle size="16" class="shrink-0" aria-hidden="true" />
		<span>Only Open job descriptions take applications. Drafts are hidden from the public.</span>
	</p>
</section>
