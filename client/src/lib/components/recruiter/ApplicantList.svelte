<!--
@component
The applicants of a job description, oldest first: who they are (their name when they applied
themselves, else the portfolio's title), a link to their portfolio (a new tab: the recruiter
keeps this page), when they applied or were added, and how (Applied / Added by you). Remove asks
the page (`onRemove`), which confirms first. Each Remove button carries
`data-remove-applicant="<id>"`: the page moves the focus to the next one after a removal.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowTopRightOnSquare, Trash } from 'svelte-heros-v2';
	import {
		APPLICANT_SOURCE_LABELS,
		applicantDateText,
		applicantInitials,
		applicantName,
		isoDate,
		type Applicant
	} from '#services/recruiter.ts';

	let {
		applicants,
		removingId = null,
		onRemove
	}: {
		applicants: Applicant[];
		/** The applicant being removed (its button shows it) */
		removingId?: string | null;
		onRemove: (applicant: Applicant) => void;
	} = $props();
</script>

<ul class="divide-y divide-surface-200-800" aria-label="Applicants">
	{#each applicants as applicant (applicant._id)}
		{@const name = applicantName(applicant)}
		<li class="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
			<span
				class="grid size-9 shrink-0 place-items-center rounded-full preset-tonal-primary text-xs font-bold"
				aria-hidden="true"
			>
				{applicantInitials(applicant)}
			</span>
			<div class="min-w-0 flex-1 space-y-0.5">
				<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
					<p class="min-w-0 font-semibold break-words">{name}</p>
					<span
						class="badge text-xs {applicant.source === 'applied'
							? 'preset-tonal-success'
							: 'preset-filled-surface-200-800'}"
					>
						{APPLICANT_SOURCE_LABELS[applicant.source]}
					</span>
				</div>
				<a
					href={resolve('/[domain]/experiences', { domain: applicant.domain.name })}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex max-w-full items-center gap-1 text-sm text-primary-700-300 underline-offset-2 hover:underline"
				>
					<span class="truncate">{applicant.domain.name}</span>
					<ArrowTopRightOnSquare size="14" class="shrink-0" aria-hidden="true" />
					<span class="sr-only">(portfolio of {name}, opens in a new tab)</span>
				</a>
				<p class="text-xs text-surface-700-300">
					<time datetime={isoDate(applicant.appliedAt)}>{applicantDateText(applicant)}</time>
				</p>
			</div>
			<button
				type="button"
				class="btn btn-sm shrink-0 text-error-700-300 hover:preset-tonal-error min-h-9"
				data-remove-applicant={applicant._id}
				aria-disabled={removingId === applicant._id ? 'true' : undefined}
				onclick={() => {
					if (removingId !== applicant._id) onRemove(applicant);
				}}
			>
				<Trash size="16" aria-hidden="true" />
				<span class="max-sm:sr-only">Remove</span>
				<span class="sr-only">{name}</span>
			</button>
		</li>
	{/each}
</ul>
