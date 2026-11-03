<script lang="ts">
	import { onMount } from 'svelte';
	import { DatePicker, parseDate } from '@skeletonlabs/skeleton-svelte';
	import type { DateValue } from '@skeletonlabs/skeleton-svelte';
	import { wallDateInTimezone } from 'portfolio-common';
	import type { BookingHorizon } from 'portfolio-common';
	import { portfolioApi } from '#services';
	import { errorStatus, isSlotUnavailable } from '#services/apiErrors.ts';
	import {
		DATES_FAILED,
		SLOTS_FAILED,
		availabilityFailure,
		firstShownDate,
		isUnbookable,
		loadBookableDates,
		toIsoDate
	} from '#services/bookingDates.ts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let ownerName = $derived(data.domain.headerTitle || data.domainName);

	interface AvailabilityWindow {
		dayOfWeek: number;
		startTime: string;
		endTime: string;
	}

	interface PublicSchedule {
		id: string;
		title: string;
		description: string | null;
		durationMinutes: number;
		minNoticeHours: number;
		timezone: string;
		locationType: string;
		locationDetails: string | null;
		availability: AvailabilityWindow[];
		maxAdvanceDays: number;
	}

	interface Slot {
		start: string;
		end: string;
	}

	interface Confirmation {
		start: string;
		end: string;
		meetLink: string | null;
		eventLink: string | null;
		email: string;
	}

	/** The dates of the selected schedule that can be picked; every other one is greyed out */
	type BookableDatesState =
		| { status: 'loading' }
		| { status: 'ready'; horizon: BookingHorizon; dates: string[] }
		| { status: 'error'; message: string; retry: boolean };

	const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	const LOCATION_LABELS: Record<string, string> = {
		google_meet: 'Google Meet',
		phone: 'Phone call',
		in_person: 'In person',
		custom: 'Details after booking'
	};

	const visitorTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	// Month and weekday names, and the first day of the week, as the visitor reads them
	const visitorLocale = Intl.DateTimeFormat().resolvedOptions().locale;

	let schedules = $state<PublicSchedule[]>([]);
	let schedulesLoading = $state(true);
	let selectedSchedule = $state<PublicSchedule | null>(null);
	// Why the meeting type picked went away (paused or deleted meanwhile): shown above the others
	let notice = $state('');

	let bookableDates = $state<BookableDatesState>({ status: 'loading' });
	// Answers to an earlier request (another schedule picked meanwhile) are dropped
	let datesRequest = 0;

	let selectedDate = $state('');
	let slots = $state<Slot[]>([]);
	let slotsLoading = $state(false);
	let slotsLoaded = $state(false);
	let slotsError = $state<{ message: string; retry: boolean } | null>(null);
	let slotsRequest = 0;
	let selectedSlot = $state<Slot | null>(null);

	let name = $state('');
	let email = $state('');
	let notes = $state('');
	let booking = $state(false);
	let bookingError = $state('');
	let confirmation = $state<Confirmation | null>(null);

	let availableDays = $derived(
		selectedSchedule ? [...new Set(selectedSchedule.availability.map((w) => w.dayOfWeek))] : []
	);

	// Date picker inputs, rebuilt only when the bookable dates change
	let isDateUnavailable = $derived(
		isUnbookable(new Set(bookableDates.status === 'ready' ? bookableDates.dates : []))
	);
	let calendarBounds = $derived(
		bookableDates.status === 'ready'
			? {
					min: parseDate(bookableDates.horizon.first),
					max: parseDate(bookableDates.horizon.last)
				}
			: null
	);
	// Read when the calendar mounts only: back from a booking, it opens on the month of the date
	// picked, else on the first bookable one
	let opensOn = $derived(
		bookableDates.status === 'ready'
			? parseDate(firstShownDate(bookableDates.dates, bookableDates.horizon, selectedDate))
			: null
	);
	let pickedDates = $derived(selectedDate ? [parseDate(selectedDate)] : []);

	/** An API call that could not reach the API, as Eden reports the ones that did */
	const unreachable = (error: unknown) => ({
		data: null,
		error: { status: undefined, value: error }
	});

	/** `autoSelect`: on arrival, a single schedule is selected right away */
	async function loadSchedules({ autoSelect = false } = {}) {
		schedulesLoading = true;
		const { data: found, error } = await portfolioApi.appointments
			.domains({ domainName: encodeURIComponent(data.domainName) })
			.schedules.get()
			.catch(unreachable);
		if (!error && found) {
			schedules = found;
			const gone = selectedSchedule;
			if (autoSelect && schedules.length === 1) {
				selectSchedule(schedules[0]);
			} else if (gone && !schedules.some((s) => s.id === gone.id)) {
				// Paused or deleted meanwhile: back to the meeting types left (shown even when one is),
				// saying why. Never one selected for the visitor: nothing would explain the change
				leaveSchedule();
				notice = `${gone.title} is not available anymore. Please pick another meeting type.`;
			}
		}
		schedulesLoading = false;
	}

	function selectSchedule(schedule: PublicSchedule) {
		selectedSchedule = schedule;
		notice = '';
		clearDate();
		confirmation = null;
		bookingError = '';
		loadDates();
	}

	function leaveSchedule() {
		selectedSchedule = null;
		// Dates and slots still on their way are for that schedule
		datesRequest++;
		bookableDates = { status: 'loading' };
		clearDate();
	}

	/** No date picked, and nothing of the one picked before */
	function clearDate() {
		selectedDate = '';
		slots = [];
		// Slots still on their way are for the previous date or schedule
		slotsRequest++;
		slotsLoading = false;
		slotsLoaded = false;
		slotsError = null;
		selectedSlot = null;
	}

	/**
	 * Asks the API which dates of the booking horizon have a free slot. `refresh` keeps the
	 * calendar on screen while asking again (after a booking), instead of showing it loading.
	 */
	async function loadDates({ refresh = false } = {}) {
		const schedule = selectedSchedule;
		if (!schedule) return;
		const request = ++datesRequest;
		if (!refresh || bookableDates.status !== 'ready') bookableDates = { status: 'loading' };

		const loaded = await loadBookableDates((range) =>
			portfolioApi.appointments['available-dates'].get({
				query: { scheduleId: schedule.id, ...range }
			})
		);
		if (request !== datesRequest) return;

		if (loaded.ok) {
			bookableDates = { status: 'ready', horizon: loaded.horizon, dates: loaded.dates };
			// The booking just made took the last free slot of the date picked
			if (selectedDate && !loaded.dates.includes(selectedDate)) clearDate();
			return;
		}
		// A refreshed calendar stays as it was: the slots of a date are checked when it is picked
		if (refresh && bookableDates.status === 'ready') return;
		const failure = availabilityFailure(loaded.error, DATES_FAILED);
		bookableDates = { status: 'error', message: failure.message, retry: failure.retry };
		if (failure.reloadSchedules) await loadSchedules();
	}

	/** A date the API listed turned out to have no free slot left: grey it out too */
	function markDateFull(date: string) {
		if (bookableDates.status !== 'ready' || !bookableDates.dates.includes(date)) return;
		bookableDates = { ...bookableDates, dates: bookableDates.dates.filter((d) => d !== date) };
	}

	function pickDate(value: DateValue | undefined) {
		// Picking the selected date again unselects it: keep it
		if (!value) return;
		selectedDate = toIsoDate(value);
		loadSlots();
	}

	/**
	 * Space picks the focused date, as Enter does: the date picker's grid only handles Enter, and
	 * its cells are role="button". The date is the one the arrow keys moved to (the date picker's
	 * own focus, which the page focus follows a frame later), unless it cannot be picked.
	 */
	function pickWithSpace(
		event: KeyboardEvent,
		picker: { focusedValue: DateValue; setValue: (values: DateValue[]) => void }
	) {
		if (event.key !== ' ') return;
		// No page scroll either way
		event.preventDefault();
		const date = picker.focusedValue;
		if (isDateUnavailable(date) || toIsoDate(date) === selectedDate) return;
		picker.setValue([date]);
	}

	async function loadSlots() {
		if (!selectedSchedule || !selectedDate) return;
		const date = selectedDate;
		const request = ++slotsRequest;
		slotsLoading = true;
		slotsError = null;
		selectedSlot = null;
		const { data: available, error } = await portfolioApi.appointments['available-slots']
			.get({ query: { scheduleId: selectedSchedule.id, date } })
			.catch(unreachable);
		// Another date was picked meanwhile
		if (request !== slotsRequest) return;
		slotsLoading = false;
		if (error || !available) {
			const failure = availabilityFailure(error ?? { status: undefined }, SLOTS_FAILED);
			slots = [];
			slotsLoaded = false;
			slotsError = { message: failure.message, retry: failure.retry };
			if (failure.reloadSchedules) await loadSchedules();
			return;
		}
		slots = available;
		slotsLoaded = true;
		if (slots.length === 0) markDateFull(date);
	}

	async function book() {
		if (!selectedSchedule || !selectedSlot) return;
		booking = true;
		bookingError = '';

		const { data: booked, error } = await portfolioApi.appointments.book
			.post({
				scheduleId: selectedSchedule.id,
				startTime: selectedSlot.start,
				name,
				email,
				notes: notes || undefined
			})
			.catch(unreachable);

		booking = false;
		if (error || !booked) {
			const status = errorStatus(error);
			if (isSlotUnavailable(error)) {
				bookingError = 'This slot was just taken. Please pick another one.';
			} else if (status === 409) {
				// The owner's calendar cannot take bookings now (not connected, or its Google access
				// was revoked): reloading the schedules shows that online booking is unavailable
				await loadSchedules();
				bookingError = 'Online booking is not available right now. Please reach out directly.';
				return;
			} else if (status === 429 && typeof error?.value === 'string') {
				// Rate limit or booking cap: the API's message says what to do, or how long to wait
				bookingError = error.value;
			} else {
				bookingError = 'Booking failed. Please try again.';
			}
			await loadSlots();
			return;
		}

		confirmation = { ...booked, email };
		// The booked slot may have been the last of its date
		loadDates({ refresh: true });
	}

	function formatTime(iso: string): string {
		return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
	}

	/**
	 * A slot's time for the visitor, with its day when that is not the date picked: the dates are
	 * the owner's, and the visitor's clock can be on the day before or after
	 */
	function slotLabel(slot: Slot): string {
		const time = formatTime(slot.start);
		if (wallDateInTimezone(new Date(slot.start), visitorTimezone) === selectedDate) return time;
		const day = new Date(slot.start).toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
		return `${day}, ${time}`;
	}

	function formatFullDate(iso: string): string {
		return new Date(iso).toLocaleString(undefined, {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	onMount(() => loadSchedules({ autoSelect: true }));
</script>

<svelte:head>
	<title>Hire {ownerName}</title>
	<meta name="description" content={`Book a meeting with ${ownerName}.`} />
</svelte:head>

<div class="max-w-3xl mx-auto p-6 space-y-8">
	<section class="space-y-2">
		<h1 class="h2">Book a meeting with {ownerName}</h1>
		<p class="opacity-75">
			Pick a time slot that suits you — you'll receive a calendar invitation by email.
		</p>
	</section>

	{#if confirmation}
		<section class="card p-6 space-y-4">
			<h2 class="h3">You're booked! 🎉</h2>
			<p>
				<strong>{formatFullDate(confirmation.start)}</strong>
				({formatTime(confirmation.start)} – {formatTime(confirmation.end)}, {visitorTimezone})
			</p>
			<p class="opacity-75">
				A calendar invitation has been sent to <strong>{confirmation.email}</strong>.
			</p>
			{#if confirmation.meetLink}
				<!-- eslint-disable svelte/no-navigation-without-resolve -- external Google Meet URL -->
				<a
					class="btn preset-filled-primary-500"
					href={confirmation.meetLink}
					target="_blank"
					rel="noopener noreferrer"
				>
					Google Meet link
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
			<button
				class="btn preset-tonal"
				onclick={() => {
					confirmation = null;
					selectedSlot = null;
					loadSlots();
				}}
			>
				Book another slot
			</button>
		</section>
	{:else if schedulesLoading}
		<p class="text-sm opacity-50">Loading availability...</p>
	{:else if schedules.length === 0}
		<section class="card p-6">
			<p class="opacity-75">
				Online booking is not available right now. Please reach out directly.
			</p>
		</section>
	{:else}
		{#if notice}
			<p class="card preset-tonal-warning p-4 text-sm" role="status">{notice}</p>
		{/if}

		<!-- Also with one meeting type left when none is selected: the one picked went away -->
		{#if schedules.length > 1 || !selectedSchedule}
			<section class="space-y-3">
				<h2 class="h4">Meeting type</h2>
				<div class="grid gap-3 sm:grid-cols-2">
					{#each schedules as schedule (schedule.id)}
						<button
							class="card p-4 text-left space-y-1 {selectedSchedule?.id === schedule.id
								? 'preset-tonal-primary border border-primary-500'
								: 'hover:preset-tonal'}"
							onclick={() => selectSchedule(schedule)}
						>
							<p class="font-semibold">{schedule.title}</p>
							<p class="text-sm opacity-75">
								{schedule.durationMinutes} min · {LOCATION_LABELS[schedule.locationType] ??
									schedule.locationType}
							</p>
							{#if schedule.description}
								<p class="text-sm opacity-50">{schedule.description}</p>
							{/if}
						</button>
					{/each}
				</div>
			</section>
		{/if}

		{#if selectedSchedule}
			<section class="card p-4 sm:p-6 space-y-4">
				<div class="space-y-1">
					<h2 class="h4">{selectedSchedule.title}</h2>
					<p class="text-sm opacity-75">
						{selectedSchedule.durationMinutes} min · {LOCATION_LABELS[
							selectedSchedule.locationType
						] ?? selectedSchedule.locationType}
						{#if selectedSchedule.locationType !== 'google_meet' && selectedSchedule.locationDetails}
							· {selectedSchedule.locationDetails}
						{/if}
					</p>
					{#if availableDays.length > 0}
						<p class="text-sm opacity-50">
							Available on {availableDays.map((d) => DAY_NAMES[d]).join(', ')}
						</p>
					{/if}
				</div>

				{#if bookableDates.status === 'loading'}
					<p class="text-sm opacity-50" role="status">Loading available dates...</p>
				{:else if bookableDates.status === 'error'}
					<div class="space-y-2" role="alert">
						<p class="text-sm text-error-500">{bookableDates.message}</p>
						{#if bookableDates.retry}
							<button class="btn btn-sm preset-tonal" onclick={() => loadDates()}>Try again</button>
						{/if}
					</div>
				{:else if bookableDates.dates.length === 0}
					<p class="text-sm opacity-75" role="status">
						No date is open for booking in the next {selectedSchedule.maxAdvanceDays} days. Please check
						back later, or reach out directly.
					</p>
				{:else if calendarBounds && opensOn}
					<div class="space-y-2">
						<p class="label-text" id="booking-date-label">Pick a date</p>
						<!-- Mounted once the dates of the schedule are known: it opens on the month of the
						first bookable one. Unbookable dates are greyed out, and neither a click nor the
						keyboard (Enter, Space) can pick them -->
						<DatePicker
							inline
							locale={visitorLocale}
							timeZone={selectedSchedule.timezone}
							min={calendarBounds.min}
							max={calendarBounds.max}
							defaultFocusedValue={opensOn}
							value={pickedDates}
							onValueChange={(details) => pickDate(details.value[0])}
							{isDateUnavailable}
							maxView="day"
							class="w-fit"
						>
							<DatePicker.Content aria-labelledby="booking-date-label">
								<DatePicker.View view="day">
									<DatePicker.Context>
										{#snippet children(datePicker)}
											<DatePicker.ViewControl>
												<DatePicker.PrevTrigger />
												<DatePicker.RangeText class="self-center font-semibold capitalize" />
												<DatePicker.NextTrigger />
											</DatePicker.ViewControl>
											<DatePicker.Table
												class="border-spacing-1"
												onkeydown={(event) => pickWithSpace(event, datePicker())}
											>
												<DatePicker.TableHead>
													<DatePicker.TableRow>
														{#each datePicker().weekDays as weekDay (weekDay.long)}
															<DatePicker.TableHeader class="opacity-60">
																{weekDay.short}
															</DatePicker.TableHeader>
														{/each}
													</DatePicker.TableRow>
												</DatePicker.TableHead>
												<DatePicker.TableBody>
													{#each datePicker().weeks as week (week[0].toString())}
														<DatePicker.TableRow>
															{#each week as day (day.toString())}
																<DatePicker.TableCell value={day} class="size-9 sm:size-10">
																	<DatePicker.TableCellTrigger
																		class="focus-visible:outline-2 focus-visible:outline-primary-500 data-[unavailable]:line-through data-[unavailable]:opacity-40 data-[outside-range]:invisible [&[data-selectable]:not([data-selected])]:preset-tonal-primary [&[data-selectable]:not([data-selected])]:hover:preset-filled-primary-200-800 data-[selectable]:cursor-pointer data-[selectable]:font-semibold data-[selected]:preset-filled-primary-500"
																	>
																		{day.day}
																	</DatePicker.TableCellTrigger>
																</DatePicker.TableCell>
															{/each}
														</DatePicker.TableRow>
													{/each}
												</DatePicker.TableBody>
											</DatePicker.Table>
										{/snippet}
									</DatePicker.Context>
								</DatePicker.View>
							</DatePicker.Content>
						</DatePicker>
						<p class="text-xs opacity-60">
							Greyed-out dates have no free slot.
							{#if selectedSchedule.timezone !== visitorTimezone}
								Dates follow {ownerName}'s time zone ({selectedSchedule.timezone}); times are shown
								in yours.
							{/if}
						</p>
					</div>
				{/if}

				{#if slotsLoading}
					<p class="text-sm opacity-50" role="status">Checking availability...</p>
				{:else if slotsError}
					<div class="space-y-2" role="alert">
						<p class="text-sm text-error-500">{slotsError.message}</p>
						{#if slotsError.retry}
							<button class="btn btn-sm preset-tonal" onclick={() => loadSlots()}>Try again</button>
						{/if}
					</div>
				{:else if slotsLoaded && slots.length === 0}
					<p class="text-sm opacity-75">No slots left on this date — please pick another one.</p>
				{:else if slots.length > 0}
					<div class="space-y-2">
						<p class="text-sm opacity-50">Times shown in your timezone ({visitorTimezone})</p>
						<div class="flex flex-wrap gap-2">
							{#each slots as slot (slot.start)}
								<button
									class="btn {selectedSlot?.start === slot.start
										? 'preset-filled-primary-500'
										: 'preset-tonal'}"
									onclick={() => (selectedSlot = slot)}
								>
									{slotLabel(slot)}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				{#if selectedSlot}
					<form
						class="space-y-4 border-t border-surface-300-700 pt-4"
						onsubmit={(e) => {
							e.preventDefault();
							book();
						}}
					>
						<p class="text-sm">
							Booking <strong>{formatFullDate(selectedSlot.start)}</strong>
						</p>
						<label class="label">
							<span class="label-text">Your name *</span>
							<input class="input" type="text" required bind:value={name} placeholder="Jane Doe" />
						</label>
						<label class="label">
							<span class="label-text">Your email *</span>
							<input
								class="input"
								type="email"
								required
								bind:value={email}
								placeholder="jane@company.com"
							/>
						</label>
						<label class="label">
							<span class="label-text">Notes (optional)</span>
							<textarea
								class="textarea"
								rows="3"
								bind:value={notes}
								placeholder="What would you like to talk about?"></textarea>
						</label>
						{#if bookingError}
							<p class="text-sm text-error-500">{bookingError}</p>
						{/if}
						<button class="btn preset-filled-primary-500" type="submit" disabled={booking}>
							{booking ? 'Booking...' : 'Confirm booking'}
						</button>
					</form>
				{/if}
			</section>
		{/if}
	{/if}
</div>
