// A step a portfolio owner suggests for the hiring journey, from their step editor: the API files
// it as an issue in the project's GitHub repository (POST /workflow/step-suggestions). The rules
// are shared by the form (which shows them) and the API (which enforces them).
import { cleanIssueText } from './issueText';
import { stepSuggestionMessages as m } from './stepSuggestion.messages';

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

/** A suggestion's text as it is filed: one kind of line break, nothing invisible, trimmed */
export const cleanStepSuggestionText = cleanIssueText;

const text = (value: unknown) => (typeof value === 'string' ? cleanStepSuggestionText(value) : '');

/**
 * The suggestion as it is filed (cleaned, the name on one line), or the first rule it breaks: the
 * rules are checked on the text that would reach the issue, so nothing invisible counts as an answer
 */
export function parseStepSuggestion(input: {
	name?: unknown;
	description?: unknown;
	reason?: unknown;
}): StepSuggestionResult {
	const name = text(input.name).replace(/\s+/g, ' ');
	const description = text(input.description);
	const reason = text(input.reason);
	if (!name) return { ok: false, field: 'name', message: m.nameRequired };
	if (name.length > STEP_SUGGESTION_LIMITS.name) {
		return {
			ok: false,
			field: 'name',
			message: m.nameTooLong(STEP_SUGGESTION_LIMITS.name)
		};
	}
	if (!description) {
		return {
			ok: false,
			field: 'description',
			message: m.descriptionRequired
		};
	}
	if (description.length > STEP_SUGGESTION_LIMITS.description) {
		return {
			ok: false,
			field: 'description',
			message: m.textTooLong(STEP_SUGGESTION_LIMITS.description)
		};
	}
	if (reason.length > STEP_SUGGESTION_LIMITS.reason) {
		return {
			ok: false,
			field: 'reason',
			message: m.textTooLong(STEP_SUGGESTION_LIMITS.reason)
		};
	}
	return { ok: true, suggestion: { name, description, ...(reason ? { reason } : {}) } };
}
