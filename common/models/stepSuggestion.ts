// A step a portfolio owner suggests for the hiring journey, from their step editor: the API files
// it as an issue in the project's GitHub repository (POST /workflow/step-suggestions). The rules
// are shared by the form (which shows them) and the API (which enforces them).

export const STEP_SUGGESTION_LIMITS = { name: 80, description: 1500, reason: 1500 } as const;

export interface StepSuggestionInput {
	/** What the step would be called, e.g. "Share the salary range" */
	name: string;
	/** What a recruiter would do on it */
	description: string;
	/** Why it would help the owner; optional */
	reason?: string;
}

export type StepSuggestionField = keyof StepSuggestionInput;

export type StepSuggestionResult =
	| { ok: true; suggestion: StepSuggestionInput }
	| { ok: false; field: StepSuggestionField; message: string };

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** The suggestion as it is sent (trimmed, the name on one line), or the first rule it breaks */
export function parseStepSuggestion(input: {
	name?: unknown;
	description?: unknown;
	reason?: unknown;
}): StepSuggestionResult {
	const name = text(input.name).replace(/\s+/g, ' ');
	const description = text(input.description);
	const reason = text(input.reason);
	if (!name) return { ok: false, field: 'name', message: 'Give the step a name.' };
	if (name.length > STEP_SUGGESTION_LIMITS.name) {
		return {
			ok: false,
			field: 'name',
			message: `The name is at most ${STEP_SUGGESTION_LIMITS.name} characters.`
		};
	}
	if (!description) {
		return {
			ok: false,
			field: 'description',
			message: 'Say what a recruiter would do on this step.'
		};
	}
	if (description.length > STEP_SUGGESTION_LIMITS.description) {
		return {
			ok: false,
			field: 'description',
			message: `This is at most ${STEP_SUGGESTION_LIMITS.description} characters.`
		};
	}
	if (reason.length > STEP_SUGGESTION_LIMITS.reason) {
		return {
			ok: false,
			field: 'reason',
			message: `This is at most ${STEP_SUGGESTION_LIMITS.reason} characters.`
		};
	}
	return { ok: true, suggestion: { name, description, ...(reason ? { reason } : {}) } };
}
