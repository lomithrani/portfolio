<!--
@component
What a job posting says about the job, as a definition list: location and work mode, contract
and start, working time, pay, openings, team, profile, skills, languages, benefits and travel.
Every value goes through the formatters of `#services/jobPosting.ts` (jobFacts); what a posting
does not say is left out. Lists (skills, languages, benefits) show as chips.
-->
<script lang="ts">
	import {
		AcademicCap,
		Banknotes,
		Clock,
		DocumentText,
		Gift,
		Language,
		MapPin,
		PaperAirplane,
		UserGroup,
		Users,
		WrenchScrewdriver
	} from 'svelte-heros-v2';
	import { jobFacts, type JobFactId, type JobPostingLike } from '#services/jobPosting.ts';

	let { job, class: className = '' }: { job: JobPostingLike; class?: string } = $props();

	const ICONS: Record<JobFactId, typeof MapPin> = {
		place: MapPin,
		contract: DocumentText,
		workingTime: Clock,
		pay: Banknotes,
		openings: UserGroup,
		team: Users,
		profile: AcademicCap,
		skills: WrenchScrewdriver,
		languages: Language,
		benefits: Gift,
		travel: PaperAirplane
	};

	/** Lists span the whole width: they can be long */
	const WIDE: readonly JobFactId[] = ['skills', 'languages', 'benefits'];

	let facts = $derived(jobFacts(job));
</script>

{#if facts.length > 0}
	<dl class="grid gap-x-6 gap-y-4 sm:grid-cols-2 {className}">
		{#each facts as fact (fact.id)}
			{@const Icon = ICONS[fact.id]}
			<div class="flex min-w-0 gap-3 {WIDE.includes(fact.id) ? 'sm:col-span-2' : ''}">
				<span
					class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full preset-tonal-primary"
				>
					<Icon size="16" aria-hidden="true" />
				</span>
				<div class="min-w-0 flex-1">
					<dt class="text-xs font-medium tracking-wide text-surface-700-300 uppercase">
						{fact.label}
					</dt>
					{#each fact.lines as line, index (index)}
						<dd
							class="break-words {index === 0
								? 'font-medium text-surface-950-50'
								: 'text-sm text-surface-700-300'}"
						>
							{line}
						</dd>
					{/each}
					{#if fact.items && fact.items.length > 0}
						<dd class="mt-1">
							<ul class="flex flex-wrap gap-1.5" aria-label={fact.label}>
								{#each fact.items as item (item)}
									<li
										class="chip preset-tonal max-w-full py-1 text-sm break-words whitespace-normal"
									>
										{item}
									</li>
								{/each}
							</ul>
						</dd>
					{/if}
				</div>
			</div>
		{/each}
	</dl>
{/if}
