import { STEP_SUGGESTION_LIMITS, type StepSuggestionField } from 'portfolio-common';
import { isNetworkFailure, NETWORK_ERROR } from './recruiter';

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

export const SUGGESTION_SEND_FAILED = 'Could not send your suggestion. Try again.';

export interface SuggestionFailure {
	message: string;
	/** The field the problem is about: shown under it */
	field?: StepSuggestionField;
	/** `signed-out`: the session ended; `off`: this server takes no suggestion (any more) */
	kind: 'error' | 'signed-out' | 'off';
}

const isField = (value: unknown): value is StepSuggestionField =>
	typeof value === 'string' && Object.hasOwn(STEP_SUGGESTION_LIMITS, value);

const bodyText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Why POST /workflow/step-suggestions failed, as the form says it */
export const suggestionFailure = (
	status: number | undefined,
	value: unknown
): SuggestionFailure => {
	if (isNetworkFailure(value)) return { message: NETWORK_ERROR, kind: 'error' };
	const text = bodyText(value);
	switch (status) {
		case 401:
			return {
				message: 'Your session expired. Sign in again to send your suggestion.',
				kind: 'signed-out'
			};
		case 403:
			return { message: 'Only the owner of a portfolio can suggest a step.', kind: 'error' };
		case 404:
			return { message: 'Suggestions are not available right now.', kind: 'off' };
		case 422: {
			// A rule of the API this page does not know yet: said at the field it names
			const problem = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
			const message = bodyText(problem.message);
			return isField(problem.property) && message
				? { message, field: problem.property, kind: 'error' }
				: { message: 'Check your suggestion and try again.', kind: 'error' };
		}
		case 429:
			// The API says which limit (the owner's or the site's) and when to come back
			return {
				message: text || 'Too many suggestions for today. Try again tomorrow.',
				kind: 'error'
			};
		case 503:
			return { message: text || SUGGESTION_SEND_FAILED, kind: 'error' };
		default:
			return { message: SUGGESTION_SEND_FAILED, kind: 'error' };
	}
};
