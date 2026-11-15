<!--
@component
The landing page's onboarding card: a candidate goes from nothing to a portfolio of their own in
three steps, shown as a stepper so they always see where they are.

The address comes first and is visible from the start, even signed out: the "browser bar" at the
top shows the full address as it is typed, with its availability (GET /domain/:name/availability,
a hint: the claim decides). What is typed before signing in is kept through the sign-in.

1. Sign in with Google, after the age and terms checkbox (AgeTermsConsent). Google's script is
   loaded, and its button rendered, only once the box is ticked: before that nothing is asked
   from accounts.google.com. The sign-in sends the confirmation (POST /login with consent).
2. Claim the address (POST /domain/claim), with the checkbox again for an account that signed in
   elsewhere without accepting the terms in force; the candidate space becomes the active one.
3. Add the résumé: the PDF import of the experiences page (`?import=1` opens it) when the API
   offers it, else the experiences page to add them by hand.

The server renders the signed-out card, with a neutral placeholder for the steps until the session
is checked in the browser (no flash of the wrong step). The header offers no sign-in on this page
(Header `showSignIn={false}`), so this card's Google handler is the only one registered.
-->
<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		ArrowPath,
		ArrowRight,
		Check,
		DocumentArrowUp,
		ExclamationTriangle,
		InformationCircle,
		LockClosed,
		Plus
	} from 'svelte-heros-v2';
	import {
		RESERVED_DOMAIN_NAMES,
		legalMessages,
		currentConsent,
		getLocale,
		normalizeDomainName
	} from 'portfolio-common';
	import AgeTermsConsent from '#components/legal/AgeTermsConsent.svelte';
	import Rich from '#lib/i18n/Rich.svelte';
	import { common } from '#lib/i18n/common.messages.ts';
	import { portfolioApi } from '#services';
	import {
		DOMAIN_NAME_MAX_LENGTH,
		PORTFOLIO_NAME_PLACEHOLDER,
		checkDomainAvailability,
		claimPortfolio,
		domainAvailabilityMessage,
		domainNameProblem,
		hasAcceptedCurrentTerms,
		portfolioUrlPreview,
		refreshAccount,
		suggestDomainName,
		switchMode,
		type DomainAvailabilityStatus
	} from '#services/account.ts';
	import { accountMessages } from '#services/account.messages.ts';
	import { isSessionValid, signIn } from '#services/authentication.ts';
	import { setupGoogleIdentity } from '#services/googleIdentity.ts';
	import { quotaText, type ImportStatus } from '#services/resumeImport.ts';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { toaster } from '#services/toaster.ts';
	import { m } from './CandidateOnboarding.messages.ts';

	const uid = $props.id();
	const addressId = `${uid}-address`;
	const consentId = `${uid}-consent`;
	const claimConsentId = `${uid}-claim-consent`;

	// The site's host, as the address will read ("portfolio.example/jane.doe"): the server renders
	// it from the request too
	const host = page.url.host;

	let user = $derived(
		$sessionCheckedStore && isSessionValid($authenticationStore)
			? $authenticationStore.user
			: undefined
	);
	let ownedDomain = $derived(user?.domain);

	type Step = 1 | 2 | 3;
	/** The step the candidate is at; null until the session is checked (the server's render) */
	let current = $derived<Step | null>(
		!$sessionCheckedStore ? null : !user ? 1 : ownedDomain ? 3 : 2
	);

	// --- The address -------------------------------------------------------------------------
	let name = $state('');
	let addressInput: HTMLInputElement | undefined = $state();
	let normalizedName = $derived(normalizeDomainName(name));
	let shownName = $derived(ownedDomain ?? (normalizedName || PORTFOLIO_NAME_PLACEHOLDER));
	let preview = $derived(portfolioUrlPreview(host, ownedDomain ?? name));

	// The first name offered once signed in (from the account's name or email), only when nothing
	// was typed, and once per account: clearing the field does not bring it back
	let prefilledFor: string | undefined;
	$effect(() => {
		const account = user;
		if (!account || account.domain || prefilledFor === account._id) return;
		prefilledFor = account._id;
		untrack(() => {
			if (!name.trim()) name = suggestDomainName(account);
		});
	});

	type Availability = { name: string; status: DomainAvailabilityStatus | 'checking' };
	let availability = $state<Availability | null>(null);

	// Checked while typing: at most one request per pause (350 ms), an answer for a name that was
	// changed since is dropped. A name the rules refuse is answered here, after the same pause (no
	// message for a name still being typed)
	$effect(() => {
		const value = normalizedName;
		if (ownedDomain || !value) {
			availability = null;
			return;
		}
		const problem = domainNameProblem(value);
		const controller = new AbortController();
		availability = problem ? null : { name: value, status: 'checking' };
		const timer = setTimeout(async () => {
			if (problem) {
				availability = {
					name: value,
					status: RESERVED_DOMAIN_NAMES.has(value) ? 'reserved' : 'invalid'
				};
				return;
			}
			const { status } = await checkDomainAvailability(value, controller.signal);
			if (!controller.signal.aborted) availability = { name: value, status };
		}, 350);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	const PILLS: Record<Availability['status'], { label: string; tone: string }> = {
		checking: { label: m.address.pill.checking, tone: 'preset-tonal' },
		available: { label: m.address.pill.available, tone: 'preset-filled-success-500' },
		// The same error tone as the field's border and message (and AA contrast on a 12 px badge)
		taken: { label: m.address.pill.taken, tone: 'preset-tonal-error' },
		invalid: { label: m.address.pill.invalid, tone: 'preset-tonal-error' },
		reserved: { label: m.address.pill.reserved, tone: 'preset-tonal-error' },
		error: { label: m.address.pill.notChecked, tone: 'preset-tonal' },
		'rate-limited': { label: m.address.pill.notChecked, tone: 'preset-tonal' }
	};

	/** The claim's refusal of a name, shown while that name is in the field */
	let refusedName = $state<{
		name: string;
		message: string;
		status: 'taken' | 'invalid' | 'reserved';
	} | null>(null);
	let addressMessage = $derived.by(() => {
		if (refusedName && refusedName.name === normalizedName) return refusedName.message;
		if (!availability || availability.name !== normalizedName) return null;
		if (availability.status === 'checking') return null;
		return domainAvailabilityMessage(availability.status, name);
	});
	let addressInvalid = $derived(
		(!!refusedName && refusedName.name === normalizedName) ||
			(availability?.name === normalizedName &&
				['taken', 'invalid', 'reserved'].includes(availability.status))
	);
	let pill = $derived.by(() => {
		if (refusedName && refusedName.name === normalizedName) return PILLS[refusedName.status];
		if (!availability || availability.name !== normalizedName) return null;
		return PILLS[availability.status];
	});

	// What a screen reader hears about the address, once typing paused and the check answered
	let liveText = $derived.by(() => {
		if (ownedDomain || !normalizedName || !pill || pill === PILLS.checking) return '';
		return m.address.announcement(preview, pill.label);
	});
	let announcement = $state('');
	$effect(() => {
		const text = liveText;
		const timer = setTimeout(() => (announcement = text), 400);
		return () => clearTimeout(timer);
	});

	// --- Step 1: sign in -----------------------------------------------------------------------
	let consent = $state(false);
	let consentError = $state('');
	let buttonContainer: HTMLDivElement | undefined = $state();
	let gsiState = $state<'loading' | 'ready' | 'unavailable'>('loading');
	let signingIn = $state(false);
	let signInError = $state('');
	let releaseGoogle: (() => void) | undefined;
	let mounted = false;

	const isDark = () => document.documentElement.classList.contains('dark');

	/** Google's answer to its button: signs in with the confirmation ticked above */
	const onCredential = async ({ credential }: google.accounts.id.CredentialResponse) => {
		if (!mounted) return;
		// The box may have been unticked since the button showed
		if (!consent) {
			consentError = m.signIn.tickToSignIn;
			document.getElementById(consentId)?.focus();
			return;
		}
		signInError = '';
		signingIn = true;
		const result = await signIn(credential, { mode: 'candidate', consent: currentConsent() });
		signingIn = false;
		if (!result.ok) {
			// Terms changed since the page loaded: retrying sends the same version, only a reload helps
			signInError =
				result.reason === 'stale-terms' ? legalMessages.staleTerms : common.signInFailed;
			return;
		}
		claimError = '';
		const account = $authenticationStore.user;
		toaster.success(
			account?.domain
				? {
						title: m.signIn.welcomeBack.title,
						description: m.signIn.welcomeBack.description(account.domain)
					}
				: { title: m.signIn.done.title, description: m.signIn.done.description }
		);
		await focusCurrentStep();
	};

	// Google's script and button, once the box is ticked (and for as long as it stays ticked: the
	// button goes away with the tick, the script stays loaded)
	$effect(() => {
		const container = buttonContainer;
		if (!consent || !container || current !== 1) return;
		let cancelled = false;
		gsiState = 'loading';
		setupGoogleIdentity(onCredential)
			.then(({ id, release }) => {
				releaseGoogle = release;
				if (cancelled) return;
				id.renderButton(container, {
					theme: isDark() ? 'filled_black' : 'outline',
					size: 'large',
					type: 'standard',
					text: 'signin_with',
					shape: 'pill',
					logo_alignment: 'left',
					locale: getLocale(),
					width: Math.min(320, Math.max(200, container.clientWidth))
				});
				gsiState = 'ready';
			})
			.catch(() => {
				if (!cancelled) gsiState = 'unavailable';
			});
		return () => {
			cancelled = true;
		};
	});

	onMount(() => {
		mounted = true;
		return () => {
			mounted = false;
			releaseGoogle?.();
		};
	});

	// --- Step 2: claim the address -------------------------------------------------------------
	let claimConsent = $state(false);
	let claimConsentError = $state('');
	/** The API asked for the confirmation although the session said it was given */
	let consentAsked = $state(false);
	let needsClaimConsent = $derived(!!user && (consentAsked || !hasAcceptedCurrentTerms(user)));
	let claiming = $state(false);
	let claimError = $state('');

	const focusAddress = (options?: FocusOptions) => {
		addressInput?.focus(options);
		addressInput?.select();
	};

	async function claim(event: SubmitEvent) {
		event.preventDefault();
		// Enter in the address field before signing in: on to the checkbox
		if (current === 1) document.getElementById(consentId)?.focus();
		if (current !== 2 || claiming) return;
		claimError = '';
		const problem = domainNameProblem(name);
		if (problem) {
			refusedName = {
				name: normalizedName,
				message: problem,
				status: RESERVED_DOMAIN_NAMES.has(normalizedName) ? 'reserved' : 'invalid'
			};
			focusAddress();
			return;
		}
		if (needsClaimConsent && !claimConsent) {
			claimConsentError = accountMessages.claim.consent;
			document.getElementById(claimConsentId)?.focus();
			return;
		}

		claiming = true;
		const result = await claimPortfolio(name, needsClaimConsent ? currentConsent() : undefined);
		if (!result.ok) {
			claiming = false;
			if (result.reason === 'session-expired') {
				// Back to step 1: the address typed is kept
				signInError = result.message;
				await focusCurrentStep();
			} else if (result.cause === 'name') {
				// 409: taken meanwhile; 400/422: the API refused the name itself
				refusedName = {
					name: normalizedName,
					message: result.message,
					status: result.message === accountMessages.name.taken ? 'taken' : 'invalid'
				};
				focusAddress();
			} else if (result.cause === 'owns-domain') {
				// The session was behind: the account's portfolio is known once reloaded (step 3)
				await refreshAccount();
				toaster.info({ title: result.message });
				await focusCurrentStep();
			} else if (result.cause === 'consent') {
				consentAsked = true;
				claimConsent = false;
				claimConsentError = result.message;
				await tick();
				document.getElementById(claimConsentId)?.focus();
			} else {
				claimError = result.message;
			}
			return;
		}

		// The portfolio is the candidate space: make it the active one, as the other claim forms do
		// (a failure only leaves the account menu's label as it was)
		await switchMode('candidate');
		claiming = false;
		toaster.success({
			title: accountMessages.claim.claimed,
			description: m.claim.claimed(result.name)
		});
		await focusCurrentStep();
	}

	// --- Step 3: the résumé ------------------------------------------------------------------
	let importStatus = $state<ImportStatus | null>(null);
	let importChecked = $state(false);
	let importAvailable = $derived(!!importStatus?.enabled && importStatus.remaining > 0);

	$effect(() => {
		const domain = ownedDomain;
		if (!domain) return;
		let cancelled = false;
		importChecked = false;
		portfolioApi.experiences.import
			.get({ fetch: { credentials: 'include' } })
			.then(({ data }) => {
				if (!cancelled) importStatus = data ?? null;
			})
			.catch(() => {})
			.finally(() => {
				if (!cancelled) importChecked = true;
			});
		return () => {
			cancelled = true;
		};
	});

	// --- Focus -------------------------------------------------------------------------------
	const stepHeadings: Partial<Record<Step, HTMLElement>> = $state({});

	/** Moves the focus to the step the candidate is now at (after a sign-in or a claim) */
	async function focusCurrentStep() {
		await tick();
		if (current) stepHeadings[current]?.focus();
	}

	/**
	 * The hero's "Create your portfolio": the address field, or the step to continue from once
	 * there is nothing to type
	 */
	export function focusStart(options?: FocusOptions) {
		if (addressInput) focusAddress(options);
		else if (current) stepHeadings[current]?.focus(options);
	}

	type StepInfo = { n: Step; title: string; done: string; upcoming: string };
	let steps = $derived<StepInfo[]>([
		{
			n: 1,
			title: common.signInWithGoogle,
			done: user?.email ? m.signIn.signedInAs(user.email) : m.signIn.signedIn,
			upcoming: ''
		},
		{
			n: 2,
			title: m.claim.title,
			done: m.claim.yours(preview),
			// Not an address the pill just called taken, reserved or not valid
			upcoming:
				domainNameProblem(name) || addressInvalid ? m.claim.reserveChosen : m.claim.reserve(preview)
		},
		{
			n: 3,
			title: m.resume.title,
			done: '',
			upcoming: m.resume.upcoming
		}
	]);

	const stepState = (n: Step): 'done' | 'current' | 'upcoming' | 'unknown' =>
		current === null ? 'unknown' : n < current ? 'done' : n === current ? 'current' : 'upcoming';

	const STEP_STATE_TEXT = {
		done: m.steps.state.done,
		current: m.steps.state.current,
		upcoming: m.steps.state.upcoming,
		unknown: ''
	} as const;

	const alertClass =
		'flex items-start gap-2 rounded-base border border-error-500/60 preset-tonal-error p-3 text-sm text-surface-950-50';
</script>

<section
	id="create"
	class="card preset-outlined-surface-200-800 bg-surface-50-950 scroll-mt-4 overflow-hidden shadow-xl"
	aria-labelledby="{uid}-title"
>
	<!-- The address, as a browser would show it: the page's visual hook -->
	<div
		class="flex items-center gap-3 border-b border-surface-200-800 bg-surface-100-900 px-3 py-2.5 md:px-4"
	>
		<span class="hidden shrink-0 gap-1.5 sm:flex" aria-hidden="true">
			<span class="size-3 rounded-full bg-error-400"></span>
			<span class="size-3 rounded-full bg-warning-400"></span>
			<span class="size-3 rounded-full bg-success-400"></span>
		</span>
		<p
			class="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-surface-50-950 px-3 py-1.5 text-sm shadow-inner md:text-base"
			data-testid="address-preview"
		>
			<LockClosed
				size="14"
				class={['shrink-0', addressInvalid ? 'text-surface-700-300' : 'text-success-700-300']}
				aria-hidden="true"
			/>
			<span class="sr-only">{m.address.preview}</span>
			<span class="min-w-0 break-all"
				><span class="text-surface-700-300">{host}/</span><span
					class={[
						'font-semibold',
						ownedDomain
							? 'text-primary-700-300'
							: !normalizedName
								? 'text-surface-700-300'
								: addressInvalid
									? 'text-error-700-300 line-through decoration-1'
									: 'text-primary-700-300'
					]}>{shownName}</span
				></span
			>
		</p>
		{#if ownedDomain}
			<span class="badge preset-filled-success-500 shrink-0">
				<Check size="12" aria-hidden="true" />
				{m.address.yours}
			</span>
		{/if}
	</div>

	<form class="space-y-6 p-4 sm:p-5 md:p-6" novalidate onsubmit={claim}>
		<div class="space-y-1">
			<h2 id="{uid}-title" class="text-xl font-bold">
				{ownedDomain ? m.title.online : m.title.create}
			</h2>
			<p class="text-sm text-surface-700-300">
				{ownedDomain ? m.subtitle.online : m.subtitle.create}
			</p>
		</div>

		{#if !ownedDomain}
			<div class="space-y-2">
				<div class="flex items-center justify-between gap-3">
					<label for={addressId} class="text-sm font-medium">{m.address.label}</label>
					{#if pill}
						<span class={['badge shrink-0', pill.tone]} data-testid="availability">
							{#if pill === PILLS.checking}
								<ArrowPath
									size="12"
									class="animate-spin motion-reduce:animate-none"
									aria-hidden="true"
								/>
							{:else if pill === PILLS.available}
								<Check size="12" aria-hidden="true" />
							{/if}
							{pill.label}
						</span>
					{/if}
				</div>
				<div
					class={[
						'flex items-stretch overflow-hidden rounded-base border bg-surface-50-950 focus-within:ring-2',
						addressInvalid
							? 'border-error-500 focus-within:ring-error-500'
							: 'border-surface-300-700 focus-within:ring-primary-500'
					]}
				>
					<span
						class="flex max-w-[55%] shrink-0 items-center border-e border-surface-200-800 bg-surface-100-900 px-3 text-sm text-surface-700-300 select-none"
						aria-hidden="true"
						title="{host}/"><span class="truncate">{host}/</span></span
					>
					<input
						bind:this={addressInput}
						bind:value={name}
						id={addressId}
						type="text"
						class="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base outline-none placeholder:text-surface-500"
						inputmode="url"
						autocomplete="off"
						autocapitalize="none"
						spellcheck="false"
						maxlength={DOMAIN_NAME_MAX_LENGTH}
						placeholder={PORTFOLIO_NAME_PLACEHOLDER}
						readonly={claiming}
						aria-invalid={addressInvalid ? 'true' : undefined}
						aria-describedby="{uid}-address-hint"
					/>
				</div>
				<p
					id="{uid}-address-hint"
					class={[
						'text-sm',
						addressMessage && addressInvalid ? 'text-error-700-300' : 'text-surface-700-300'
					]}
				>
					{addressMessage ?? m.address.hint(PORTFOLIO_NAME_PLACEHOLDER)}
				</p>
				<p class="sr-only" aria-live="polite">{announcement}</p>
			</div>
		{/if}

		<ol class="space-y-0" aria-label={m.steps.label}>
			{#each steps as step, index (step.n)}
				{@const status = stepState(step.n)}
				<li
					class="relative flex gap-3 pb-6 last:pb-0 sm:gap-4"
					aria-current={status === 'current' ? 'step' : undefined}
					data-step-state={status}
				>
					{#if index < steps.length - 1}
						<span
							class={[
								'absolute start-4 top-10 bottom-1 w-0.5 -translate-x-1/2 rounded-full rtl:translate-x-1/2',
								status === 'done' ? 'bg-success-500' : 'bg-surface-200-800'
							]}
							aria-hidden="true"
						></span>
					{/if}
					<span
						class={[
							'relative flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
							status === 'done' && 'preset-filled-success-500',
							status === 'current' &&
								'preset-filled-primary-500 ring-4 ring-primary-500/25 dark:ring-primary-400/25',
							(status === 'upcoming' || status === 'unknown') &&
								'border border-surface-300-700 text-surface-700-300'
						]}
						aria-hidden="true"
					>
						{#if status === 'done'}
							<Check size="16" />
						{:else}
							{step.n}
						{/if}
					</span>
					<div class="min-w-0 flex-1 space-y-3 pt-1">
						<h3
							bind:this={stepHeadings[step.n]}
							tabindex="-1"
							class={[
								'font-semibold outline-none focus-visible:underline',
								status === 'upcoming' && 'text-surface-700-300'
							]}
						>
							<span class="sr-only">{m.steps.number(step.n)}</span>
							{step.title}
							{#if STEP_STATE_TEXT[status]}
								<span class="sr-only">({STEP_STATE_TEXT[status]})</span>
							{/if}
						</h3>
						{#if status === 'done'}
							<p class="text-sm text-surface-700-300">{step.done}</p>
						{:else if status === 'upcoming' && step.upcoming}
							<p class="text-sm text-surface-700-300">{step.upcoming}</p>
						{:else if status === 'current'}
							{#if step.n === 1}
								{@render signInStep()}
							{:else if step.n === 2}
								{@render claimStep()}
							{:else}
								{@render resume()}
							{/if}
						{:else if status === 'unknown' && step.n === 1}
							<!-- The session is being checked: the step to show is not known yet -->
							<div class="space-y-3" aria-hidden="true">
								<div class="placeholder h-10 w-full animate-pulse motion-reduce:animate-none"></div>
								<div
									class="placeholder h-11 w-full max-w-80 animate-pulse rounded-full motion-reduce:animate-none"
								></div>
							</div>
						{/if}
					</div>
				</li>
			{/each}
		</ol>
	</form>
</section>

{#snippet signInStep()}
	<div class="space-y-4">
		<p class="text-sm text-surface-700-300" data-testid="returning-owner">
			{m.signIn.returning}
		</p>
		<AgeTermsConsent
			bind:checked={consent}
			error={consent ? undefined : consentError || undefined}
			disabled={signingIn}
			id={consentId}
		/>
		{#if signInError}
			<p class={alertClass} role="alert">
				<ExclamationTriangle
					size="18"
					class="mt-0.5 shrink-0 text-error-700-300"
					aria-hidden="true"
				/>
				{signInError}
			</p>
		{/if}
		{#if signingIn}
			<p class="flex items-center gap-2 text-sm font-medium" role="status">
				<ArrowPath size="16" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
				{common.signingIn}
			</p>
		{/if}
		{#if consent}
			<!-- Google renders its button in there; a placeholder of its size until it does -->
			<div class={['relative flex min-h-11 w-full max-w-80', { invisible: signingIn }]}>
				<div bind:this={buttonContainer} class="flex w-full" data-testid="google-button"></div>
				{#if gsiState === 'loading'}
					<div
						class="absolute inset-0 animate-pulse rounded-full bg-surface-200-800 motion-reduce:animate-none"
						aria-hidden="true"
					></div>
				{/if}
			</div>
			{#if gsiState === 'unavailable'}
				<p class="text-sm text-error-700-300" role="alert">
					{m.signIn.googleUnavailable}
				</p>
			{/if}
		{:else}
			<p
				class="flex min-h-11 w-full max-w-80 items-center justify-center rounded-full border border-dashed border-surface-300-700 px-4 text-center text-sm text-surface-700-300"
			>
				{m.signIn.tickToContinue}
			</p>
		{/if}
		<p class="text-xs text-surface-700-300">
			{m.signIn.dataKept}
		</p>
	</div>
{/snippet}

{#snippet claimStep()}
	<div class="space-y-4">
		{#if needsClaimConsent}
			<AgeTermsConsent
				bind:checked={claimConsent}
				error={claimConsent ? undefined : claimConsentError || undefined}
				disabled={claiming}
				id={claimConsentId}
			/>
		{/if}
		{#if claimError}
			<p class={alertClass} role="alert">
				<ExclamationTriangle
					size="18"
					class="mt-0.5 shrink-0 text-error-700-300"
					aria-hidden="true"
				/>
				{claimError}
			</p>
		{/if}
		<button
			type="submit"
			class="btn preset-filled-primary-700-300 min-h-11 w-full sm:w-auto"
			aria-disabled={claiming ? 'true' : undefined}
		>
			{#if claiming}
				<ArrowPath size="18" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
				{accountMessages.claim.claiming}
			{:else}
				{m.claim.submit}
				<ArrowRight size="18" aria-hidden="true" />
			{/if}
		</button>
		<p class="text-xs text-surface-700-300">
			{m.claim.onePerAccount}
		</p>
	</div>
{/snippet}

{#snippet resume()}
	<div class="space-y-4">
		{#if !importChecked}
			<div class="space-y-3" aria-hidden="true">
				<div class="placeholder h-12 w-full animate-pulse motion-reduce:animate-none"></div>
				<div
					class="placeholder h-11 w-full max-w-64 animate-pulse rounded-base motion-reduce:animate-none"
				></div>
			</div>
			<p class="sr-only" role="status">{common.loading}</p>
		{:else if importAvailable && importStatus}
			<p class="text-sm">
				{m.resume.importIntro}
			</p>
			<p class="flex items-start gap-2 text-xs text-surface-700-300">
				<InformationCircle size="16" class="shrink-0" aria-hidden="true" />
				<span>
					<Rich text={m.resume.importNotice}>
						{#snippet privacy(text)}<a class="link-text" href={resolve('/(site)/legal/privacy')}
								>{text}</a
							>{/snippet}
					</Rich>
				</span>
			</p>
			<div class="flex flex-wrap items-center gap-3">
				<a
					href={resolve('/[domain]/experiences?import=1', { domain: ownedDomain ?? '' })}
					class="btn preset-filled-primary-700-300 min-h-11 max-sm:w-full"
				>
					<DocumentArrowUp size="18" aria-hidden="true" />
					{m.resume.upload}
				</a>
				<span class="text-xs text-surface-700-300">{quotaText(importStatus)}</span>
			</div>
		{:else}
			<p class="text-sm">
				{m.resume.byHandIntro}
			</p>
			{#if importStatus?.enabled}
				<p class="text-xs text-surface-700-300">
					{m.resume.importsUsed}
				</p>
			{/if}
			<a
				href={resolve('/[domain]/experiences', { domain: ownedDomain ?? '' })}
				class="btn preset-filled-primary-700-300 min-h-11 max-sm:w-full"
			>
				<Plus size="18" aria-hidden="true" />
				{m.resume.byHand}
			</a>
		{/if}
		<p>
			<a
				href={resolve('/[domain]/experiences', { domain: ownedDomain ?? '' })}
				class="btn btn-sm -ms-2 px-2 hover:preset-tonal"
			>
				{m.resume.open}
				<ArrowRight size="16" aria-hidden="true" />
			</a>
		</p>
	</div>
{/snippet}
