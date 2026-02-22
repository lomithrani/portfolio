<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { api } from '$services/portfolio';

	const CLIENT_ID = '1075297079847-nkpqjg6shjj9lbcdofs6tlf21rprqr7q.apps.googleusercontent.com';
	const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

	const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
	const LOCATION_TYPES = [
		{ value: 'google_meet', label: 'Google Meet' },
		{ value: 'phone', label: 'Phone' },
		{ value: 'in_person', label: 'In Person' },
		{ value: 'custom', label: 'Custom' }
	] as const;

	// --- GSI state ---
	let gsiReady = $state(false);

	// --- Connection state ---
	let connected = $state(false);
	let connectedAt = $state<string | null>(null);
	let connectionLoading = $state(true);
	let connecting = $state(false);

	// --- Calendars state ---
	let calendars = $state<GoogleCalendar[]>([]);
	let calendarsLoading = $state(false);

	// --- Schedule state ---
	let schedules = $state<Schedule[]>([]);
	let schedulesLoading = $state(false);
	let editingSchedule = $state<EditableSchedule | null>(null);
	let savingSchedule = $state(false);
	let scheduleMessage = $state('');

	// --- Booked appointments state ---
	let bookings = $state<CalendarEvent[]>([]);
	let bookingsLoading = $state(false);
	let cancellingEvent = $state<string | null>(null);

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
		locationType: string;
		locationDetails?: string;
		availability: AvailabilityWindow[];
		enabled: boolean;
	}

	interface EditableSchedule {
		_id?: string;
		title: string;
		description: string;
		durationMinutes: number;
		bufferMinutes: number;
		minNoticeHours: number;
		maxAdvanceDays: number;
		timezone: string;
		calendarId: string;
		locationType: string;
		locationDetails: string;
		availability: AvailabilityWindow[];
		enabled: boolean;
	}

	interface CalendarEvent {
		id: string;
		summary: string;
		start: string;
		end: string;
		attendees: string[];
		meetLink: string | null;
		htmlLink: string | null;
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

	// --- API calls ---
	async function loadCalendars() {
		calendarsLoading = true;
		const { data, error } = await api.appointments.calendars.get({
			fetch: { credentials: 'include' }
		});
		if (!error && data) {
			calendars = data as unknown as GoogleCalendar[];
		}
		calendarsLoading = false;
	}

	async function checkConnectionStatus() {
		connectionLoading = true;
		const { data, error } = await api.appointments['calendar-status'].get({
			fetch: { credentials: 'include' }
		});
		if (!error && data) {
			connected = data.connected;
			connectedAt = data.connectedAt as string | null;
		}
		connectionLoading = false;
	}

	async function connectCalendar() {
		if (!browser) return;
		connecting = true;

		const client = google.accounts.oauth2.initCodeClient({
			client_id: CLIENT_ID,
			scope: CALENDAR_SCOPE,
			ux_mode: 'popup',
			callback: async (response) => {
				if (response.error) {
					connecting = false;
					return;
				}
				const { error } = await api.appointments.connect.post(
					{ code: response.code },
					{ fetch: { credentials: 'include' } }
				);
				connecting = false;
				if (!error) {
					await checkConnectionStatus();
					await Promise.all([loadCalendars(), loadSchedules(), loadBookings()]);
				}
			}
		});
		client.requestCode();
	}

	async function disconnectCalendar() {
		const { error } = await api.appointments.disconnect.post(
			{},
			{ fetch: { credentials: 'include' } }
		);
		if (!error) {
			connected = false;
			connectedAt = null;
			schedules = [];
		}
	}

	async function loadSchedules() {
		schedulesLoading = true;
		const { data, error } = await api.appointments.schedules.get({
			fetch: { credentials: 'include' }
		});
		if (!error && data) {
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
			locationType: editingSchedule.locationType as
				| 'google_meet'
				| 'phone'
				| 'in_person'
				| 'custom',
			locationDetails: editingSchedule.locationDetails || undefined,
			availability: editingSchedule.availability,
			enabled: editingSchedule.enabled
		};

		let error;
		if (editingSchedule._id) {
			({ error } = await api.appointments.schedules({ id: editingSchedule._id }).put(body, {
				fetch: { credentials: 'include' }
			}));
		} else {
			({ error } = await api.appointments.schedules.post(body, {
				fetch: { credentials: 'include' }
			}));
		}

		savingSchedule = false;
		if (error) {
			scheduleMessage = 'Failed to save schedule.';
		} else {
			scheduleMessage = 'Schedule saved!';
			editingSchedule = null;
			await loadSchedules();
		}
	}

	async function deleteSchedule(id: string) {
		const { error } = await api.appointments.schedules({ id }).delete({
			fetch: { credentials: 'include' }
		});
		if (!error) {
			schedules = schedules.filter((s) => s._id !== id);
		}
	}

	async function loadBookings() {
		bookingsLoading = true;
		const { data, error } = await api.appointments.upcoming.get({
			fetch: { credentials: 'include' }
		});
		if (!error && data) {
			bookings = data as unknown as CalendarEvent[];
		}
		bookingsLoading = false;
	}

	async function cancelEvent(eventId: string) {
		cancellingEvent = eventId;
		const { error } = await api.appointments.events({ eventId }).delete({
			fetch: { credentials: 'include' }
		});
		cancellingEvent = null;
		if (!error) {
			bookings = bookings.filter((e) => e.id !== eventId);
		}
	}

	function formatDateTime(iso: string): string {
		return new Date(iso).toLocaleString(undefined, {
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

	function removeWindow(dayOfWeek: number, index: number) {
		if (!editingSchedule) return;
		const windows = editingSchedule.availability.filter((w) => w.dayOfWeek === dayOfWeek);
		const target = windows[index];
		editingSchedule.availability = editingSchedule.availability.filter((w) => w !== target);
	}

	function loadGsi(): Promise<void> {
		return new Promise((resolve) => {
			if (typeof google !== 'undefined' && google.accounts?.oauth2) {
				gsiReady = true;
				resolve();
				return;
			}
			const script = document.createElement('script');
			script.src = 'https://accounts.google.com/gsi/client';
			script.async = true;
			script.onload = () => {
				gsiReady = true;
				resolve();
			};
			document.body.appendChild(script);
		});
	}

	onMount(async () => {
		await Promise.all([checkConnectionStatus(), loadGsi()]);
		if (connected) {
			await Promise.all([loadCalendars(), loadSchedules(), loadBookings()]);
		}
	});
</script>

<div class="space-y-8">
	<!-- Section 1: Google Calendar Connection -->
	<section class="card p-6 space-y-4">
		<h2 class="h3">Google Calendar</h2>
		<p class="opacity-75">
			Connect your Google Calendar so visitors can book meetings on your available time slots.
			The app will check your calendar for conflicts and create events automatically.
		</p>

		{#if connectionLoading}
			<p class="text-sm opacity-50">Checking connection...</p>
		{:else if connected}
			<div class="flex items-center gap-3">
				<span class="badge preset-filled-success-500 text-sm px-3 py-1">Connected</span>
				{#if connectedAt}
					<span class="text-sm opacity-50">
						since {new Date(connectedAt).toLocaleDateString()}
					</span>
				{/if}
			</div>
			<p class="text-sm opacity-50">
				Your calendar permissions are active. Visitors can book available slots and events will be added to your Google Calendar.
			</p>
			<button
				type="button"
				class="btn preset-outlined-error-500 text-sm"
				onclick={disconnectCalendar}
			>
				Disconnect
			</button>
		{:else}
			<button
				type="button"
				class="btn preset-filled-primary-700-300"
				disabled={connecting || !gsiReady}
				onclick={connectCalendar}
			>
				{connecting ? 'Connecting...' : 'Connect Google Calendar'}
			</button>
		{/if}
	</section>

	{#if connected}
		<!-- Section 2: Schedule Configuration -->
		<section class="card p-6 space-y-4">
			<div class="flex items-center justify-between">
				<div>
					<h2 class="h3">Appointment Schedules</h2>
					<p class="text-sm opacity-50 mt-1">
						Define when visitors can book time with you. Each schedule sets the duration, availability windows, and booking rules.
					</p>
				</div>
				{#if !editingSchedule}
					<button
						type="button"
						class="btn preset-filled-primary-700-300 text-sm"
						onclick={() => (editingSchedule = newSchedule())}
					>
						New Schedule
					</button>
				{/if}
			</div>

			{#if editingSchedule}
				<!-- Schedule Form -->
				<div class="space-y-4 border border-surface-300-700 rounded-lg p-4">
					<h3 class="h4">{editingSchedule._id ? 'Edit' : 'New'} Schedule</h3>

					<label class="label">
						<span>Title</span>
						<input class="input" type="text" placeholder="e.g. 30-min consultation" bind:value={editingSchedule.title} />
					</label>

					<label class="label">
						<span>Description (optional)</span>
						<textarea class="textarea" rows="2" placeholder="Shown to visitors when booking" bind:value={editingSchedule.description}></textarea>
					</label>

					<div class="grid grid-cols-2 gap-4">
						<label class="label">
							<span>Duration</span>
							<select class="select" bind:value={editingSchedule.durationMinutes}>
								{#each DURATION_OPTIONS as d}
									<option value={d}>{d} min</option>
								{/each}
							</select>
						</label>

						<label class="label">
							<span>Buffer between meetings (min)</span>
							<input class="input" type="number" min="0" bind:value={editingSchedule.bufferMinutes} />
						</label>

						<label class="label">
							<span>Min notice before booking (hours)</span>
							<input class="input" type="number" min="0" bind:value={editingSchedule.minNoticeHours} />
						</label>

						<label class="label">
							<span>Max days in advance</span>
							<input class="input" type="number" min="1" bind:value={editingSchedule.maxAdvanceDays} />
						</label>
					</div>

					<label class="label">
						<span>Google Calendar</span>
						{#if calendarsLoading}
							<p class="text-sm opacity-50">Loading calendars...</p>
						{:else}
							<select class="select" bind:value={editingSchedule.calendarId}>
								{#each calendars as cal}
									<option value={cal.id}>
										{cal.summary}{cal.primary ? ' (primary)' : ''}
									</option>
								{/each}
							</select>
						{/if}
					</label>

					<div class="grid grid-cols-2 gap-4">
						<label class="label">
							<span>Timezone</span>
							<input class="input" type="text" bind:value={editingSchedule.timezone} />
						</label>

						<label class="label">
							<span>Meeting location</span>
							<select class="select" bind:value={editingSchedule.locationType}>
								{#each LOCATION_TYPES as lt}
									<option value={lt.value}>{lt.label}</option>
								{/each}
							</select>
						</label>
					</div>

					{#if editingSchedule.locationType === 'custom' || editingSchedule.locationType === 'phone' || editingSchedule.locationType === 'in_person'}
						<label class="label">
							<span>Location details</span>
							<input class="input" type="text" placeholder="e.g. 123 Main St or +33 6 12 34 56 78" bind:value={editingSchedule.locationDetails} />
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
						<span class="text-sm">{editingSchedule.enabled ? 'Accepting bookings' : 'Paused'}</span>
					</div>

					<!-- Weekly Availability Grid -->
					<div class="space-y-3">
						<h4 class="font-semibold">Weekly Availability</h4>
						<p class="text-xs opacity-50">Set the time windows when visitors can book. Your actual Google Calendar events are checked at booking time to avoid conflicts.</p>
						{#each DAY_NAMES as dayName, dayIndex}
							{@const dayWindows = editingSchedule.availability.filter((w) => w.dayOfWeek === dayIndex)}
							<div class="border border-surface-300-700 rounded p-3">
								<div class="flex items-center justify-between mb-2">
									<span class="font-medium text-sm">{dayName}</span>
									<button
										type="button"
										class="btn btn-sm preset-outlined text-xs"
										onclick={() => addWindow(dayIndex)}
									>
										+ Add
									</button>
								</div>
								{#if dayWindows.length === 0}
									<p class="text-xs opacity-50">Unavailable</p>
								{:else}
									{#each dayWindows as window, windowIndex}
										<div class="flex items-center gap-2 mb-1">
											<input
												class="input text-sm"
												type="time"
												bind:value={window.startTime}
											/>
											<span class="text-sm">to</span>
											<input
												class="input text-sm"
												type="time"
												bind:value={window.endTime}
											/>
											<button
												type="button"
												class="btn btn-sm preset-outlined-error-500 text-xs"
												onclick={() => removeWindow(dayIndex, windowIndex)}
											>
												Remove
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
							{savingSchedule ? 'Saving...' : 'Save Schedule'}
						</button>
						<button
							type="button"
							class="btn preset-outlined"
							onclick={() => { editingSchedule = null; scheduleMessage = ''; }}
						>
							Cancel
						</button>
						{#if scheduleMessage}
							<span class="text-sm">{scheduleMessage}</span>
						{/if}
					</div>
				</div>
			{:else if schedulesLoading}
				<p class="text-sm opacity-50">Loading schedules...</p>
			{:else if schedules.length === 0}
				<p class="text-sm opacity-50">No schedules yet. Create one to define your available time slots.</p>
			{:else}
				<div class="space-y-3">
					{#each schedules as schedule (schedule._id)}
						<div class="flex items-center justify-between border border-surface-300-700 rounded p-3">
							<div>
								<span class="font-medium">{schedule.title}</span>
								<span class="text-sm opacity-50 ml-2">{schedule.durationMinutes} min</span>
								<span class="text-sm opacity-50 ml-1">· {calendars.find((c) => c.id === schedule.calendarId)?.summary ?? schedule.calendarId}</span>
								{#if !schedule.enabled}
									<span class="badge preset-outlined-warning-500 text-xs ml-2">Paused</span>
								{/if}
							</div>
							<div class="flex gap-2">
								<button
									type="button"
									class="btn btn-sm preset-outlined text-xs"
									onclick={() => {
										editingSchedule = {
											_id: schedule._id,
											title: schedule.title,
											description: schedule.description ?? '',
											durationMinutes: schedule.durationMinutes,
											bufferMinutes: schedule.bufferMinutes,
											minNoticeHours: schedule.minNoticeHours,
											maxAdvanceDays: schedule.maxAdvanceDays,
											timezone: schedule.timezone,
											calendarId: schedule.calendarId,
											locationType: schedule.locationType,
											locationDetails: schedule.locationDetails ?? '',
											availability: [...schedule.availability],
											enabled: schedule.enabled
										};
									}}
								>
									Edit
								</button>
								<button
									type="button"
									class="btn btn-sm preset-outlined-error-500 text-xs"
									onclick={() => deleteSchedule(schedule._id)}
								>
									Delete
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
					<h2 class="h3">Booked Appointments</h2>
					<p class="text-sm opacity-50 mt-1">Meetings booked by visitors through your portfolio.</p>
				</div>
				<button
					type="button"
					class="btn btn-sm preset-outlined text-xs"
					disabled={bookingsLoading}
					onclick={loadBookings}
				>
					{bookingsLoading ? 'Loading...' : 'Refresh'}
				</button>
			</div>

			{#if bookingsLoading}
				<p class="text-sm opacity-50">Loading bookings...</p>
			{:else if bookings.length === 0}
				<p class="text-sm opacity-50">No upcoming bookings yet.</p>
			{:else}
				<div class="space-y-3">
					{#each bookings as event (event.id)}
						<div class="border border-surface-300-700 rounded p-3 space-y-1">
							<div class="flex items-center justify-between">
								<span class="font-medium">{event.summary ?? 'Untitled'}</span>
								<button
									type="button"
									class="btn btn-sm preset-outlined-error-500 text-xs"
									disabled={cancellingEvent === event.id}
									onclick={() => cancelEvent(event.id)}
								>
									{cancellingEvent === event.id ? 'Cancelling...' : 'Cancel'}
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
								<a href={event.meetLink} target="_blank" rel="noopener" class="text-sm anchor">
									Join Google Meet
								</a>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</div>
