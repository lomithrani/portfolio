<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { ArrowLeft, Briefcase, CheckCircle, PaperAirplane } from 'svelte-heros-v2';
	import { APPLICABLE_JOB_STATUS } from 'portfolio-common';
	import JobDetails from '#components/jobs/JobDetails.svelte';
	import ApplyPanel from '#components/apply/ApplyPanel.svelte';
	import { isSessionValid } from '#services/authentication.ts';
	import {
		isOwnPosting,
		jobPageTitle,
		jobShareDescription,
		publishedText
	} from '#services/applications.ts';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import type { PageProps } from './$types';

	// A public job posting (rendered on the server: search engines, link previews) and how to
	// apply to it (ApplyPanel, in the browser once the session is checked).
	let { data }: PageProps = $props();

	let job = $derived(data.job);
	let pageTitle = $derived(jobPageTitle(job));
	let description = $derived(jobShareDescription(job));
	let published = $derived(publishedText(job));
	let isOpen = $derived(job.status === APPLICABLE_JOB_STATUS);

	// Small screens show the panel after the description: a link next to the title leads to it,
	// or, for the posting's own recruiter (nothing to apply to), straight to managing it
	let ownPosting = $derived(
		$sessionCheckedStore &&
			isSessionValid($authenticationStore) &&
			isOwnPosting(job, $authenticationStore.user)
	);
	// Whether the viewer is on the applicant list (told by the panel): the link then says so
	let applied = $state(false);
</script>

<svelte:head>
	<title>{pageTitle} | Jobs</title>
	<meta name="description" content={description} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={page.url.href} />
</svelte:head>

<div class="p-4 md:p-6">
	<div class="mx-auto w-full max-w-6xl space-y-4">
		<a
			href={resolve('/(app)/jobs')}
			class="btn btn-sm -ms-2 px-2 text-surface-700-300 hover:preset-tonal"
		>
			<ArrowLeft size="16" aria-hidden="true" />
			All jobs
		</a>

		<!-- Shrinkable columns on every screen: a long portfolio name in the panel (truncated in its
		     button) never widens the page past the viewport -->
		<div
			class="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start"
		>
			<JobDetails {job} showStatus={!isOpen} headingLevel={2}>
				{#snippet meta()}
					{#if published}<p>{published}</p>{/if}
				{/snippet}
				{#snippet actions()}
					{#if ownPosting}
						<a
							href={resolve('/(app)/recruiter/jobs/[id]', { id: job._id })}
							class="btn preset-tonal min-h-11 max-sm:w-full lg:hidden"
						>
							<Briefcase size="18" aria-hidden="true" />
							Manage it
						</a>
					{:else if isOpen}
						<a
							href="#apply"
							class="btn min-h-11 max-sm:w-full lg:hidden {applied
								? 'preset-tonal'
								: 'preset-filled-primary-500'}"
						>
							{#if applied}
								<CheckCircle size="18" class="text-success-700-300" aria-hidden="true" />
								Your application
							{:else}
								<PaperAirplane size="18" aria-hidden="true" />
								Apply
							{/if}
						</a>
					{/if}
				{/snippet}
			</JobDetails>

			<aside class="min-w-0 lg:sticky lg:top-4" aria-label="Apply">
				{#key job._id}
					<ApplyPanel {job} id="apply" onAppliedChange={(value) => (applied = value)} />
				{/key}
			</aside>
		</div>
	</div>
</div>
