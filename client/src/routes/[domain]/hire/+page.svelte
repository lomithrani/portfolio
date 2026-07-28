<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { api } from '$services/portfolio';

	interface AvailabilityWindow {
		dayOfWeek: number;
		startTime: string;
		endTime: string;
	}

	interface PublicSchedule {
		id: string;
		title: string;
		description?: string;
		durationMinutes: number;
		minNoticeHours: number;
		timezone: string;
		locationType: string;
		locationDetails?: string;
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

	const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	const LOCATION_LABELS: Record<string, string> = {
		google_meet: 'Google Meet',
		phone: 'Phone call',
		in_person: 'In person',
		custom: 'Details after booking'
	};

	const visitorTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	let schedules = $state<PublicSchedule[]>([]);
	let schedulesLoading = $state(true);
	let selectedSchedule = $state<PublicSchedule | null>(null);

	let selectedDate = $state('');
	let slots = $state<Slot[]>([]);
	let slotsLoading = $state(false);
	let slotsLoaded = $state(false);
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

	function toDateInputValue(date: Date): string {
		return date.toISOString().slice(0, 10);
	}

	let minDate = $derived.by(() => {
		if (!selectedSchedule) return toDateInputValue(new Date());
		const d = new Date(Date.now() + selectedSchedule.minNoticeHours * 3600_000);
		return toDateInputValue(d);
	});

	let maxDate = $derived.by(() => {
		if (!selectedSchedule) return '';
		const d = new Date();
		d.setDate(d.getDate() + selectedSchedule.maxAdvanceDays);
		return toDateInputValue(d);
	});

	async function loadSchedules() {
		schedulesLoading = true;
		const domainName = $page.params.domain;
		if (!domainName) {
			schedulesLoading = false;
			return;
		}
		const { data, error } = await api.appointments.domains({ domainName }).schedules.get();
		if (!error && data) {
			schedules = data as unknown as PublicSchedule[];
			if (schedules.length === 1) {
				selectSchedule(schedules[0]);
			}
		}
		schedulesLoading = false;
	}

	function selectSchedule(schedule: PublicSchedule) {
		selectedSchedule = schedule;
		selectedDate = '';
		slots = [];
		slotsLoaded = false;
		selectedSlot = null;
		confirmation = null;
		bookingError = '';
	}

	async function loadSlots() {
		if (!selectedSchedule || !selectedDate) return;
		slotsLoading = true;
		selectedSlot = null;
		const { data, error } = await api.appointments['available-slots'].get({
			query: { scheduleId: selectedSchedule.id, date: selectedDate }
		});
		slots = !error && data ? (data as unknown as Slot[]) : [];
		slotsLoading = false;
		slotsLoaded = true;
	}

	async function book() {
		if (!selectedSchedule || !selectedSlot) return;
		booking = true;
		bookingError = '';

		const { data, error } = await api.appointments.book.post({
			scheduleId: selectedSchedule.id,
			startTime: selectedSlot.start,
			name,
			email,
			notes: notes || undefined
		});

		booking = false;
		if (error || !data) {
			const status = (error as unknown as { status?: number } | null)?.status;
			bookingError =
				status === 409
					? 'This slot was just taken. Please pick another one.'
					: 'Booking failed. Please try again.';
			await loadSlots();
			return;
		}

		confirmation = { ...(data as unknown as Omit<Confirmation, 'email'>), email };
	}

	function formatTime(iso: string): string {
		return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
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

	onMount(loadSchedules);
</script>

<svelte:head>
	<title>Book a meeting</title>
	<meta name="description" content="Book a meeting slot" />
</svelte:head>

<div class="max-w-3xl mx-auto p-6 space-y-8">
	<section class="space-y-2">
		<h1 class="h2">Book a meeting</h1>
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
				<a
					class="btn preset-filled-primary-500"
					href={confirmation.meetLink}
					target="_blank"
					rel="noopener noreferrer"
				>
					Google Meet link
				</a>
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
		{#if schedules.length > 1}
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
			<section class="card p-6 space-y-4">
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

				<label class="label max-w-xs">
					<span class="label-text">Date</span>
					<input
						class="input"
						type="date"
						min={minDate}
						max={maxDate}
						bind:value={selectedDate}
						onchange={loadSlots}
					/>
				</label>

				{#if slotsLoading}
					<p class="text-sm opacity-50">Checking availability...</p>
				{:else if slotsLoaded && slots.length === 0}
					<p class="text-sm opacity-75">No slots available on this date — try another one.</p>
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
									{formatTime(slot.start)}
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
								placeholder="What would you like to talk about?"
							></textarea>
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
