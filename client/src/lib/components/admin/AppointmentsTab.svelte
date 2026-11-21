<script lang="ts">
	import { onMount } from 'svelte';
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { portfolioApi } from '#services';
	import { errorStatus } from '#services/apiErrors.ts';
	import { clearAuthentication } from '#services/authentication.ts';
	import { requestGoogleAuthorizationCode } from '#services/googleIdentity.ts';
	import { intlLocale } from 'portfolio-common';
	import { common } from '#lib/i18n/common.messages.ts';
	import Rich from '#lib/i18n/Rich.svelte';
	import { m } from './AppointmentsTab.messages.ts';

	let {
		visible = false,
		onCalendarChanged
	}: {
		/**
		 * The owner is visible to recruiters now (discovery, Path 2), which asks for the calendar
		 * connected with a meeting type that has hours: the tab says that without them it pauses
		 */
		visible?: boolean;
		/** The calendar was disconnected here (what discovery asks may have changed) */
		onCalendarChanged?: () => void;
	} = $props();

	const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
	const withCredentials = { fetch: { credentials: 'include' } } as const;

	const DAY_NAMES = m.dayNames;
	const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
	const LOCATION_TYPES = [
		{ value: 'google_meet', label: 'Google Meet' },
		{ value: 'phone', label: m.locationTypes.phone },
		{ value: 'in_person', label: m.locationTypes.inPerson },
		{ value: 'custom', label: m.locationTypes.custom }
	] as const;

	type LocationType = (typeof LOCATION_TYPES)[number]['value'];

	interface GoogleCalendar {
		id: string;
		summary: string;
		primary: boolean;
	}

	interface AvailabilityWindow {
		dayOfWeek: number;
		startTime: string;
		endTime: string;
	}

	interface Schedule {
		_id: string;
		title: string;
		description?: string;
		durationMinutes: number;
		bufferMinutes: number;
		minNoticeHours: number;
		maxAdvanceDays: number;
		timezone: string;
		calendarId: string;
		locationType: LocationType;
		locationDetails?: string;
		availability: AvailabilityWindow[];
		enabled: boolean;
	}

	type EditableSchedule = Omit<Schedule, '_id' | 'description' | 'locationDetails'> & {
		_id?: string;
		description: string;
		locationDetails: string;
	};

	interface CalendarEvent {
		id: string;
		summary: string | null;
		start: string | null;
		end: string | null;
		attendees: string[];
		meetLink: string | null;
		calendarId: string;
	}

	// --- Connection state ---
	let configured = $state(true);
	let connected = $state(false);
	let connectedAt = $state<string | null>(null);
	/** When Google refused the stored access (revoked or expired): the admin must reconnect */
	let revokedAt = $state<string | null>(null);
	let connectionLoading = $state(true);
	let connecting = $state(false);
	let connectionMessage = $state('');

	// --- Calendars state ---
	let calendars = $state<GoogleCalendar[]>([]);
	let calendarsLoading = $state(false);

	// --- Schedule state ---
	let schedules = $state<Schedule[]>([]);
	let schedulesLoading = $state(false);
	let schedulesMessage = $state('');
	let editingSchedule = $state<EditableSchedule | null>(null);
	let savingSchedule = $state(false);
	let scheduleMessage = $state('');

	// --- Booked appointments state ---
	let bookings = $state<CalendarEvent[]>([]);
	let bookingsLoading = $state(false);
	let bookingsMessage = $state('');
	let cancellingEvent = $state<string | null>(null);

	/** Message for a failed call; a 401 also signs the admin out locally */
	function failureMessage(error: { status: unknown; value?: unknown }, fallback: string): string {
		const status = errorStatus(error);
		if (status === 401) {
			clearAuthentication();
			return m.sessionExpired;
		}
		// The API's 4xx bodies are short, user-facing messages
		if (status !== undefined && status >= 400 && status < 500 && typeof error.value === 'string') {
			return error.value;
		}
		return fallback;
	}

	/**
	 * Message for a failed call that uses the Google Calendar connection. A 409 means the API has
	 * no usable connection any more: Google refused it (revoked or expired, and the API cleared it),
	 * or it was disconnected elsewhere. The status is reloaded, so the tab asks to reconnect instead
	 * of showing an error.
	 */
	async function calendarFailureMessage(
		error: { status: unknown; value?: unknown },
		fallback: string
	): Promise<string> {
		if (errorStatus(error) === 409) {
			await checkConnectionStatus();
			if (!connected) {
				clearCalendarData();
				return '';
			}
		}
		return failureMessage(error, fallback);
	}

	function clearCalendarData() {
		calendars = [];
		schedules = [];
		bookings = [];
		editingSchedule = null;
	}

	function newSchedule(): EditableSchedule {
		const primaryCal = calendars.find((c) => c.primary);
		return {
			title: '',
			description: '',
			durationMinutes: 30,
			bufferMinutes: 0,
			minNoticeHours: 24,
			maxAdvanceDays: 30,
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			calendarId: primaryCal?.id ?? 'primary',
			locationType: 'google_meet',
			locationDetails: '',
			availability: [],
			enabled: true
		};
	}

	function editSchedule(schedule: Schedule) {
		editingSchedule = {
			...schedule,
			description: schedule.description ?? '',
			locationDetails: schedule.locationDetails ?? '',
			availability: schedule.availability.map((w) => ({ ...w }))
		};
		scheduleMessage = '';
	}

	// --- API calls ---
	async function checkConnectionStatus() {
		connectionLoading = true;
		const { data, error } = await portfolioApi.appointments['calendar-status'].get(withCredentials);
		if (error) {
			connectionMessage = failureMessage(error, m.connectionCheckFailed);
		} else if (data) {
			configured = data.configured;
			connected = data.connected;
			connectedAt = data.connectedAt ? String(data.connectedAt) : null;
			revokedAt = data.revokedAt ? String(data.revokedAt) : null;
		}
		connectionLoading = false;
	}

	async function loadCalendars() {
		calendarsLoading = true;
		const { data, error } = await portfolioApi.appointments.calendars.get(withCredentials);
		if (error) {
			connectionMessage = await calendarFailureMessage(error, m.calendarsLoadFailed);
		} else if (data) {
			calendars = data;
		}
		calendarsLoading = false;
	}

	async function loadAll() {
		await Promise.all([loadCalendars(), loadSchedules(), loadBookings()]);
	}

	async function connectCalendar() {
		connecting = true;
		connectionMessage = '';

		let code: string;
		try {
			code = await requestGoogleAuthorizationCode(CALENDAR_SCOPE);
		} catch {
			connecting = false;
			connectionMessage = m.authorizationCancelled;
			return;
		}

		const { error } = await portfolioApi.appointments.connect.post({ code }, withCredentials);
		connecting = false;
		if (error) {
			connectionMessage = failureMessage(error, m.connectFailed);
			return;
		}
		await checkConnectionStatus();
		await loadAll();
	}

	async function disconnectCalendar() {
		const { error } = await portfolioApi.appointments.disconnect.post({}, withCredentials);
		if (error) {
			connectionMessage = failureMessage(error, m.disconnectFailed);
			return;
		}
		connected = false;
		connectedAt = null;
		revokedAt = null;
		clearCalendarData();
		onCalendarChanged?.();
	}

	async function loadSchedules() {
		schedulesLoading = true;
		schedulesMessage = '';
		const { data, error } = await portfolioApi.appointments.schedules.get(withCredentials);
		if (error) {
			schedulesMessage = failureMessage(error, m.schedulesLoadFailed);
		} else if (data) {
			schedules = data as unknown as Schedule[];
		}
		schedulesLoading = false;
	}

	async function saveSchedule() {
		if (!editingSchedule) return;
		savingSchedule = true;
		scheduleMessage = '';

		const body = {
			title: editingSchedule.title,
			description: editingSchedule.description || undefined,
			durationMinutes: editingSchedule.durationMinutes,
			bufferMinutes: editingSchedule.bufferMinutes,
			minNoticeHours: editingSchedule.minNoticeHours,
			maxAdvanceDays: editingSchedule.maxAdvanceDays,
			timezone: editingSchedule.timezone,
			calendarId: editingSchedule.calendarId,
			locationType: editingSchedule.locationType,
			locationDetails: editingSchedule.locationDetails || undefined,
			availability: editingSchedule.availability,
			enabled: editingSchedule.enabled
		};

		const { error } = editingSchedule._id
			? await portfolioApi.appointments
					.schedules({ id: editingSchedule._id })
					.put(body, withCredentials)
			: await portfolioApi.appointments.schedules.post(body, withCredentials);

		savingSchedule = false;
		if (error) {
			scheduleMessage = failureMessage(error, m.scheduleSaveFailed);
		} else {
			scheduleMessage = m.scheduleSaved;
			editingSchedule = null;
			await loadSchedules();
		}
	}

	async function deleteSchedule(id: string) {
		const { error } = await portfolioApi.appointments
			.schedules({ id })
			.delete(undefined, withCredentials);
		if (error) {
			scheduleMessage = failureMessage(error, m.scheduleDeleteFailed);
			return;
		}
		schedules = schedules.filter((s) => s._id !== id);
	}

	async function loadBookings() {
		bookingsLoading = true;
		bookingsMessage = '';
		const { data, error } = await portfolioApi.appointments.upcoming.get(withCredentials);
		if (error) {
			bookingsMessage = await calendarFailureMessage(error, m.bookingsLoadFailed);
		} else if (data) {
			bookings = data;
		}
		bookingsLoading = false;
	}

	async function cancelEvent(event: CalendarEvent) {
		cancellingEvent = event.id;
		const { error } = await portfolioApi.appointments
			.events({ eventId: event.id })
			.delete(undefined, { ...withCredentials, query: { calendarId: event.calendarId } });
		cancellingEvent = null;
		if (error) {
			bookingsMessage = await calendarFailureMessage(error, m.cancelFailed);
			return;
		}
		bookings = bookings.filter((e) => e.id !== event.id);
	}

	function formatDateTime(iso: string | null): string {
		if (!iso) return '';
		return new Date(iso).toLocaleString(intlLocale(undefined), {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// --- Availability helpers ---
	function addWindow(dayOfWeek: number) {
		if (!editingSchedule) return;
		editingSchedule.availability = [
			...editingSchedule.availability,
			{ dayOfWeek, startTime: '09:00', endTime: '17:00' }
		];
	}

	function removeWindow(target: AvailabilityWindow) {
		if (!editingSchedule) return;
		editingSchedule.availability = editingSchedule.availability.filter((w) => w !== target);
	}

	onMount(async () => {
		await checkConnectionStatus();
		if (connected) await loadAll();
	});
</script>

<div class="space-y-8">
	<!-- Section 1: Google Calendar Connection -->
	<section class="card p-6 space-y-4">
		<h2 class="h3">{m.googleCalendar}</h2>
		<p class="opacity-75">{m.connectionIntro}</p>

		{#if connectionLoading}
			<p class="text-sm opacity-50">{m.checkingConnection}</p>
		{:else if !configured}
			<p class="text-sm opacity-75">
				<Rich text={m.notConfigured}>
					{#snippet code(text)}<code>{text}</code>{/snippet}
				</Rich>
			</p>
		{:else if connected}
			<div class="flex items-center gap-3">
				<span class="badge preset-filled-success-500 text-sm px-3 py-1">{m.connected}</span>
				{#if connectedAt}
					<span class="text-sm opacity-50">
						{m.since(new Date(connectedAt).toLocaleDateString(intlLocale(undefined)))}
					</span>
				{/if}
			</div>
			<p class="text-sm opacity-50">{m.permissionsActive}</p>
			{#if visible}
				<p class="card preset-tonal-warning p-3 text-sm" data-pauses-discovery>
					{m.pausesDiscovery}
				</p>
			{/if}
			<button
				type="button"
				class="btn preset-outlined-error-500 text-sm"
				onclick={disconnectCalendar}
			>
				{m.disconnect}
			</button>
		{:else}
			{#if revokedAt}
				<div class="flex items-center gap-3">
					<span class="badge preset-filled-warning-500 text-sm px-3 py-1">{m.disconnected}</span>
					<span class="text-sm opacity-50">
						{m.since(new Date(revokedAt).toLocaleDateString(intlLocale(undefined)))}
					</span>
				</div>
				<p class="text-sm opacity-75" role="alert">{m.accessRefused}</p>
			{/if}
			<button
				type="button"
				class="btn preset-filled-primary-700-300"
				disabled={connecting}
				onclick={connectCalendar}
			>
				{connecting ? m.connecting : revokedAt ? m.reconnect : m.connect}
			</button>
		{/if}
		{#if connectionMessage}
			<p class="text-sm text-error-500">{connectionMessage}</p>
		{/if}
	</section>

	{#if connected}
		<!-- Section 2: Schedule Configuration -->
		<section class="card p-6 space-y-4">
			<div class="flex items-center justify-between">
				<div>
					<h2 class="h3">{m.schedules}</h2>
					<p class="text-sm opacity-50 mt-1">{m.schedulesIntro}</p>
				</div>
				{#if !editingSchedule}
					<button
						type="button"
						class="btn preset-filled-primary-700-300 text-sm"
						onclick={() => {
							editingSchedule = newSchedule();
							scheduleMessage = '';
						}}
					>
						{m.newSchedule}
					</button>
				{/if}
			</div>

			{#if schedulesMessage}
				<p class="text-sm text-error-500">{schedulesMessage}</p>
			{/if}
			{#if editingSchedule}
				<!-- Schedule Form -->
				<div class="space-y-4 border border-surface-300-700 rounded-lg p-4">
					<h3 class="h4">{editingSchedule._id ? m.editSchedule : m.newSchedule}</h3>

					<label class="label">
						<span>{m.title}</span>
						<input
							class="input"
							type="text"
							maxlength="200"
							placeholder={m.titlePlaceholder}
							bind:value={editingSchedule.title}
						/>
					</label>

					<label class="label">
						<span>{m.scheduleDescription}</span>
						<textarea
							class="textarea"
							rows="2"
							maxlength="2000"
							placeholder={m.descriptionPlaceholder}
							bind:value={editingSchedule.description}></textarea>
					</label>

					<div class="grid grid-cols-2 gap-4">
						<label class="label">
							<span>{m.duration}</span>
							<select class="select" bind:value={editingSchedule.durationMinutes}>
								{#each DURATION_OPTIONS as d (d)}
									<option value={d}>{m.minutes(d)}</option>
								{/each}
							</select>
						</label>

						<label class="label">
							<span>{m.buffer}</span>
							<input
								class="input"
								type="number"
								min="0"
								max="480"
								bind:value={editingSchedule.bufferMinutes}
							/>
						</label>

						<label class="label">
							<span>{m.minNotice}</span>
							<input
								class="input"
								type="number"
								min="0"
								bind:value={editingSchedule.minNoticeHours}
							/>
						</label>

						<label class="label">
							<span>{m.maxAdvance}</span>
							<input
								class="input"
								type="number"
								min="1"
								max="365"
								bind:value={editingSchedule.maxAdvanceDays}
							/>
						</label>
					</div>

					<label class="label">
						<span>{m.googleCalendar}</span>
						{#if calendarsLoading}
							<p class="text-sm opacity-50">{m.loadingCalendars}</p>
						{:else}
							<select class="select" bind:value={editingSchedule.calendarId}>
								{#each calendars as cal (cal.id)}
									<option value={cal.id}>
										{cal.primary ? m.primaryCalendar(cal.summary) : cal.summary}
									</option>
								{/each}
							</select>
						{/if}
					</label>

					<div class="grid grid-cols-2 gap-4">
						<label class="label">
							<span>{m.timezone}</span>
							<input class="input" type="text" bind:value={editingSchedule.timezone} />
						</label>

						<label class="label">
							<span>{m.meetingLocation}</span>
							<select class="select" bind:value={editingSchedule.locationType}>
								{#each LOCATION_TYPES as lt (lt.value)}
									<option value={lt.value}>{lt.label}</option>
								{/each}
							</select>
						</label>
					</div>

					{#if editingSchedule.locationType !== 'google_meet'}
						<label class="label">
							<span>{m.locationDetails}</span>
							<input
								class="input"
								type="text"
								maxlength="500"
								placeholder={m.locationPlaceholder}
								bind:value={editingSchedule.locationDetails}
							/>
						</label>
					{/if}

					<div class="flex items-center gap-3">
						<Switch
							checked={editingSchedule.enabled}
							onCheckedChange={(details) => {
								if (editingSchedule) editingSchedule.enabled = details.checked;
							}}
						>
							<Switch.Control>
								<Switch.Thumb />
							</Switch.Control>
							<Switch.HiddenInput />
						</Switch>
						<span class="text-sm">
							{editingSchedule.enabled ? m.acceptingBookings : m.paused}
						</span>
					</div>

					<!-- Weekly Availability Grid -->
					<div class="space-y-3">
						<h4 class="font-semibold">{m.weeklyAvailability}</h4>
						<p class="text-xs opacity-50">{m.availabilityIntro}</p>
						{#each DAY_NAMES as dayName, dayIndex (dayName)}
							{@const dayWindows = editingSchedule.availability.filter(
								(w) => w.dayOfWeek === dayIndex
							)}
							<div class="border border-surface-300-700 rounded p-3">
								<div class="flex items-center justify-between mb-2">
									<span class="font-medium text-sm">{dayName}</span>
									<button
										type="button"
										class="btn btn-sm preset-outlined text-xs"
										onclick={() => addWindow(dayIndex)}
									>
										{m.addWindow}
									</button>
								</div>
								{#if dayWindows.length === 0}
									<p class="text-xs opacity-50">{m.unavailable}</p>
								{:else}
									{#each dayWindows as window (window)}
										<div class="flex items-center gap-2 mb-1">
											<input
												class="input text-sm"
												type="time"
												aria-label={m.windowStart(dayName)}
												bind:value={window.startTime}
											/>
											<span class="text-sm">{m.to}</span>
											<input
												class="input text-sm"
												type="time"
												aria-label={m.windowEnd(dayName)}
												bind:value={window.endTime}
											/>
											<button
												type="button"
												class="btn btn-sm preset-outlined-error-500 text-xs"
												onclick={() => removeWindow(window)}
											>
												{common.remove}
											</button>
										</div>
									{/each}
								{/if}
							</div>
						{/each}
					</div>

					<div class="flex items-center gap-3">
						<button
							type="button"
							class="btn preset-filled-primary-700-300"
							disabled={savingSchedule || !editingSchedule.title}
							onclick={saveSchedule}
						>
							{savingSchedule ? m.saving : m.saveSchedule}
						</button>
						<button
							type="button"
							class="btn preset-outlined"
							onclick={() => {
								editingSchedule = null;
								scheduleMessage = '';
							}}
						>
							{common.cancel}
						</button>
						{#if scheduleMessage}
							<span class="text-sm">{scheduleMessage}</span>
						{/if}
					</div>
				</div>
			{:else if schedulesLoading}
				<p class="text-sm opacity-50">{m.loadingSchedules}</p>
			{:else if schedules.length === 0}
				<p class="text-sm opacity-50">{m.noSchedules}</p>
			{:else}
				{#if scheduleMessage}
					<p class="text-sm">{scheduleMessage}</p>
				{/if}
				<div class="space-y-3">
					{#each schedules as schedule (schedule._id)}
						<div
							class="flex items-center justify-between border border-surface-300-700 rounded p-3"
						>
							<div>
								<span class="font-medium">{schedule.title}</span>
								<span class="text-sm opacity-50 ml-2">{m.minutes(schedule.durationMinutes)}</span>
								<span class="text-sm opacity-50 ml-1">
									· {calendars.find((c) => c.id === schedule.calendarId)?.summary ??
										schedule.calendarId}
								</span>
								{#if !schedule.enabled}
									<span class="badge preset-outlined-warning-500 text-xs ml-2">{m.paused}</span>
								{/if}
							</div>
							<div class="flex gap-2">
								<button
									type="button"
									class="btn btn-sm preset-outlined text-xs"
									onclick={() => editSchedule(schedule)}
								>
									{common.edit}
								</button>
								<button
									type="button"
									class="btn btn-sm preset-outlined-error-500 text-xs"
									onclick={() => deleteSchedule(schedule._id)}
								>
									{common.delete}
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<!-- Section 3: Booked Appointments -->
		<section class="card p-6 space-y-4">
			<div class="flex items-center justify-between">
				<div>
					<h2 class="h3">{m.bookings}</h2>
					<p class="text-sm opacity-50 mt-1">{m.bookingsIntro}</p>
				</div>
				<button
					type="button"
					class="btn btn-sm preset-outlined text-xs"
					disabled={bookingsLoading}
					onclick={loadBookings}
				>
					{bookingsLoading ? m.loading : m.refresh}
				</button>
			</div>

			{#if bookingsMessage}
				<p class="text-sm text-error-500">{bookingsMessage}</p>
			{/if}
			{#if bookingsLoading}
				<p class="text-sm opacity-50">{m.loadingBookings}</p>
			{:else if bookings.length === 0}
				<p class="text-sm opacity-50">{m.noBookings}</p>
			{:else}
				<div class="space-y-3">
					{#each bookings as event (event.id)}
						<div class="border border-surface-300-700 rounded p-3 space-y-1">
							<div class="flex items-center justify-between">
								<span class="font-medium">{event.summary ?? m.untitled}</span>
								<button
									type="button"
									class="btn btn-sm preset-outlined-error-500 text-xs"
									disabled={cancellingEvent === event.id}
									onclick={() => cancelEvent(event)}
								>
									{cancellingEvent === event.id ? m.cancelling : common.cancel}
								</button>
							</div>
							<p class="text-sm opacity-75">
								{formatDateTime(event.start)} &mdash; {formatDateTime(event.end)}
							</p>
							{#if event.attendees.length > 0}
								<p class="text-sm opacity-50">
									{event.attendees.join(', ')}
								</p>
							{/if}
							{#if event.meetLink}
								<!-- eslint-disable svelte/no-navigation-without-resolve -- external Google Meet URL -->
								<a
									href={event.meetLink}
									target="_blank"
									rel="noopener noreferrer"
									class="text-sm anchor"
								>
									{m.joinMeet}
								</a>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</div>
