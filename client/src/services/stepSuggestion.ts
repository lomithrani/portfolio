import { STEP_SUGGESTION_LIMITS, type StepSuggestionField } from 'portfolio-common';
import { isNetworkFailure, networkError } from './recruiter';
import { m } from './stepSuggestion.messages';

// "Suggest a step" in the owner's hiring journey editor (components/admin/StepSuggestion.svelte):
// the owner describes a step they miss and the API files it as a feature request in the
// project's GitHub repository (GET/POST /workflow/step-suggestions). The rules of the form are
// portfolio-common's parseStepSuggestion; here, what the API's refusals mean for the owner.

export interface SuggestionForm {
	name: string;
	description: string;
	reason: string;
}

export const emptySuggestion = (): SuggestionForm => ({ name: '', description: '', reason: '' });

export interface SuggestionFailure {
	message: string;
	/** The field the problem is about: shown under it */
	field?: StepSuggestionField;
}

const isField = (value: unknown): value is StepSuggestionField =>
	typeof value === 'string' && Object.hasOwn(STEP_SUGGESTION_LIMITS, value);

const bodyText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Why POST /workflow/step-suggestions failed, as the form says it */
export const suggestionFailure = (
	status: number | undefined,
	value: unknown
): SuggestionFailure => {
	if (isNetworkFailure(value)) return { message: networkError() };
	const text = bodyText(value);
	switch (status) {
		case 401:
			// Said, not acted on: signing the page out here would take the journey editor around
			// the form, and its unsaved steps, away with it
			return { message: m.sessionExpired };
		case 403:
			return { message: m.ownerOnly };
		case 404:
			return { message: m.unavailable };
		case 422: {
			// A rule of the API this page does not know yet: said at the field it names
			const problem = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
			const message = bodyText(problem.message);
			return isField(problem.property) && message
				? { message, field: problem.property }
				: { message: m.checkSuggestion };
		}
		case 429:
			// The API says which limit (the owner's or the site's) and when to come back
			return { message: text || m.tooMany };
		case 503:
			return { message: text || m.sendFailed };
		default:
			return { message: m.sendFailed };
	}
};
