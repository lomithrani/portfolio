import type { Component } from 'svelte';
import type { Journey, JourneyStep } from '#services/workflow.ts';

// What a step type of the hiring journey is in the client. One entry per type in index.ts, under
// the name of its manifest in portfolio-common (docs/WORKFLOW_STEPS.md, "Adding a step"). The
// Hire page owns the order, the locks, the focus and the calls to the journey's routes; a step
// only shows what a visitor does on it, and the owner's editor its settings.

/** How a submit ended: `status` and `value` are the API's answer (a failed fetch: no status) */
export type SubmitResult = { ok: true } | { ok: false; status: number | undefined; value: unknown };

/** What the Hire page gives the component of a step it shows unfolded */
export interface StepProps {
	step: JourneyStep;
	journey: Journey;
	domainName: string;
	/** How the owner is named (the portfolio's title, else its name) */
	ownerName: string;
	/** The address last navigated to (page.url is stale after a shallow goto) */
	address: URL;
	/**
	 * Sends `input` to the step (POST .../steps/:stepId). On success the page shows the journey
	 * returned and moves on to the next step
	 */
	submit(input: unknown): Promise<SubmitResult>;
	/** The journey may be out of date (the owner changed it): the page loads it again */
	reload(): void;
	/** The API refused a request of this step with 401 ('signed-out') or 403 ('locked') */
	locked(reason: 'signed-out' | 'locked'): void;
	/** The step succeeded without a submit (the meeting was booked) */
	succeeded(): void;
}

/** What the owner's editor gives the settings form of a step */
export interface SettingsProps {
	/** The step's settings as edited (possibly incomplete, or not what the type expects) */
	config: object;
	onChange(config: object): void;
	/** What is wrong with the settings, and the one it is about (the manifest's parseConfig) */
	problem?: { field?: string; message: string };
	/** The journey is being saved */
	disabled: boolean;
	/** Unique in the page: prefix of the form's element ids */
	idPrefix: string;
}

/** For a step a journey leads to (an `access` step): how the Hire page presents itself */
export interface StepGoal {
	/** The page's title */
	heading(ownerName: string): string;
	/** Under the title when the step is the whole journey */
	alone: string;
	/** Under the title after "<owner> asks recruiters to complete N steps first." */
	after: string;
}

export interface ClientStep {
	/** The step as the visitor acts on it */
	Visitor: Component<StepProps>;
	/** The settings form of the owner's editor, for a type that has settings */
	Settings?: Component<SettingsProps>;
	/**
	 * The name of its own a step has, from its settings (the owner's in the editor, what visitors
	 * get of them on the Hire page); the type's label is used when it has none
	 */
	title?(step: { config?: unknown }): string | undefined;
	/** The line under the step's name for a visitor it is open to: what it asks, or what they did */
	note(step: JourneyStep, state: 'open' | 'done'): string;
	/** The address asks for this step: it shows unfolded even when it is done */
	wantsOpen?(step: JourneyStep, address: URL): boolean;
	/** What the button unfolding the step says once it is done; "Open" when unset */
	reopenLabel?: string;
	goal?: StepGoal;
}
