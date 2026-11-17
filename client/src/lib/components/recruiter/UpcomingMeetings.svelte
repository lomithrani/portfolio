<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		ArrowTopRightOnSquare,
		CalendarDays,
		ExclamationTriangle,
		MapPin,
		Phone,
		VideoCamera
	} from 'svelte-heros-v2';
	import Rich from '#lib/i18n/Rich.svelte';
	import { common } from '#lib/i18n/common.messages.ts';
	import { portfolioApi } from '#services';
	import {
		meetingDayText,
		meetingJoinLink,
		meetingLocationText,
		meetingPhase,
		meetingTimeText,
		meetingTitle,
		type BookedMeeting
	} from '#services/bookedMeetings.ts';
	import { m } from './UpcomingMeetings.messages.ts';

	// The meetings the signed-in account booked on candidates' Hire pages (GET /appointments/booked),
	// on the recruiter's dashboard: when, with whom, and the Google Meet link to join. The API only
	// lists meetings booked signed in, and drops those the candidate cancelled in Google Calendar.

	let { userId }: { userId: string } = $props();

	type ListState =
		| { kind: 'loading' }
		| { kind: 'loaded'; meetings: BookedMeeting[] }
		| { kind: 'error' }
		// Signed out meanwhile: the page shows its sign-in
		| { kind: 'hidden' };

	const withCredentials = { fetch: { credentials: 'include' } } as const;

	let list = $state.raw<ListState>({ kind: 'loading' });
	// The account whose meetings were asked for last: an older answer is ignored
	let requested: string | null = null;
	// What "now" and "starting soon" read: moves on every minute while the page is open
	let now = $state(new Date());

	async function load(id: string) {
		requested = id;
		list = { kind: 'loading' };
		try {
			const { data, error } = await portfolioApi.appointments.booked.get(withCredentials);
			if (requested !== id) return;
			if (error || !data) {
				list = error?.status === 401 ? { kind: 'hidden' } : { kind: 'error' };
				return;
			}
			now = new Date();
			list = { kind: 'loaded', meetings: data.meetings };
		} catch {
			if (requested === id) list = { kind: 'error' };
		}
	}

	$effect(() => {
		const id = userId;
		untrack(() => load(id));
	});

	$effect(() => {
		const timer = setInterval(() => (now = new Date()), 60_000);
		return () => clearInterval(timer);
	});

	const locationIcon = (meeting: BookedMeeting) =>
		meeting.location === 'phone'
			? Phone
			: meeting.location === 'in_person'
				? MapPin
				: meeting.location === 'google_meet'
					? VideoCamera
					: CalendarDays;
</script>

{#if list.kind !== 'hidden'}
	<section class="space-y-3" aria-labelledby="upcoming-meetings-title" data-upcoming-meetings>
		<h2 id="upcoming-meetings-title" class="text-xl font-bold">{m.title}</h2>

		{#if list.kind === 'loading'}
			<div aria-busy="true">
				<p class="sr-only" role="status">{common.loading}</p>
				<div
					class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-3 p-4"
					aria-hidden="true"
				>
					<div class="placeholder h-4 w-1/3 animate-pulse motion-reduce:animate-none"></div>
					<div class="placeholder h-5 w-1/2 animate-pulse motion-reduce:animate-none"></div>
				</div>
			</div>
		{:else if list.kind === 'error'}
			<div
				class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-container preset-tonal-error px-4 py-3 text-sm"
				role="alert"
			>
				<ExclamationTriangle size="20" class="shrink-0" aria-hidden="true" />
				<p class="min-w-48 flex-1">{m.loadFailed}</p>
				<button type="button" class="btn btn-sm preset-tonal min-h-9" onclick={() => load(userId)}>
					{common.retry}
				</button>
			</div>
		{:else if list.meetings.length === 0}
			<p class="text-sm text-surface-700-300">{m.empty}</p>
		{:else}
			<ul class="space-y-3">
				{#each list.meetings as meeting (meeting.id)}
					{@const phase = meetingPhase(meeting, now)}
					{@const day = meetingDayText(meeting.start, now)}
					{@const hours = meetingTimeText(meeting.start, meeting.end)}
					{@const title = meetingTitle(meeting)}
					{@const joinLink = meetingJoinLink(meeting)}
					{@const location = meetingLocationText(meeting)}
					{@const LocationIcon = locationIcon(meeting)}
					<li
						class="card bg-surface-50-950 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between {phase ===
						'later'
							? 'preset-outlined-surface-200-800'
							: 'preset-outlined-primary-500'}"
						data-meeting={meeting.id}
					>
						<div class="min-w-0 space-y-1">
							<p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-surface-700-300">
								<CalendarDays size="16" class="shrink-0" aria-hidden="true" />
								<time datetime={new Date(meeting.start).toISOString()}>{day}</time>
								<span aria-hidden="true">·</span>
								<span class="tabular-nums">{hours}</span>
								{#if phase !== 'later'}
									<span
										class="badge text-xs font-semibold {phase === 'now'
											? 'preset-filled-primary-700-300'
											: 'preset-tonal-primary'}"
									>
										{phase === 'now' ? m.now : m.soon}
									</span>
								{/if}
							</p>
							<h3 class="text-base font-semibold wrap-anywhere">{title}</h3>
							<p class="text-sm wrap-anywhere">
								{#if meeting.portfolio}
									<Rich text={m.with}>
										{#snippet portfolio()}
											<a
												href={resolve('/[domain]', { domain: meeting.portfolio?.name ?? '' })}
												class="anchor font-medium"
											>
												{meeting.portfolio?.title ?? meeting.portfolio?.name}
											</a>
										{/snippet}
									</Rich>
								{:else}
									{m.withoutPortfolio}
								{/if}
							</p>
							{#if location}
								<p class="flex items-start gap-1.5 text-sm text-surface-700-300 wrap-anywhere">
									<LocationIcon size="16" class="mt-0.5 shrink-0" aria-hidden="true" />
									{location}
								</p>
							{/if}
						</div>
						{#if joinLink}
							<!-- eslint-disable svelte/no-navigation-without-resolve -- external Google Meet URL -->
							<a
								href={joinLink}
								target="_blank"
								rel="noopener noreferrer"
								class="btn min-h-11 shrink-0 max-sm:w-full {phase === 'later'
									? 'preset-tonal'
									: 'preset-filled-primary-700-300'}"
							>
								<VideoCamera size="18" aria-hidden="true" />
								{m.join}<span class="sr-only">{m.ofMeeting(title, `${day} ${hours}`)}</span>
								<ArrowTopRightOnSquare size="14" aria-hidden="true" />
								<span class="sr-only">{m.opensInNewTab}</span>
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}
