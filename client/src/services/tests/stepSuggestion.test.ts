import { describe, expect, it } from 'vitest';
import { STEP_SUGGESTION_LIMITS, parseStepSuggestion } from 'portfolio-common';
import { NETWORK_ERROR } from '../recruiter';
import { SUGGESTION_SEND_FAILED, emptySuggestion, suggestionFailure } from '../stepSuggestion';

describe('parseStepSuggestion', () => {
	const valid = { name: 'Share the salary range', description: 'The recruiter gives the range.' };

	it('trims the text, puts the name on one line and drops an empty reason', () => {
		expect(
			parseStepSuggestion({ name: '  Share\n the   range ', description: ' a\n\nb ', reason: '  ' })
		).toEqual({ ok: true, suggestion: { name: 'Share the range', description: 'a\n\nb' } });
		expect(parseStepSuggestion({ ...valid, reason: ' It saves a call. ' })).toEqual({
			ok: true,
			suggestion: { ...valid, reason: 'It saves a call.' }
		});
	});

	it('names the first field that breaks a rule', () => {
		const long = (length: number) => 'x'.repeat(length);
		expect(parseStepSuggestion(emptySuggestion())).toEqual({
			ok: false,
			field: 'name',
			message: 'Give the step a name.'
		});
		expect(parseStepSuggestion({ ...valid, name: long(STEP_SUGGESTION_LIMITS.name + 1) })).toEqual({
			ok: false,
			field: 'name',
			message: 'The name is at most 80 characters.'
		});
		expect(parseStepSuggestion({ ...valid, description: ' ' })).toEqual({
			ok: false,
			field: 'description',
			message: 'Say what a recruiter would do on this step.'
		});
		expect(
			parseStepSuggestion({ ...valid, description: long(STEP_SUGGESTION_LIMITS.description + 1) })
		).toMatchObject({ ok: false, field: 'description' });
		expect(
			parseStepSuggestion({ ...valid, reason: long(STEP_SUGGESTION_LIMITS.reason + 1) })
		).toMatchObject({ ok: false, field: 'reason' });
		// At the limit, and anything that is not text counts as empty
		expect(parseStepSuggestion({ ...valid, name: long(STEP_SUGGESTION_LIMITS.name) }).ok).toBe(
			true
		);
		expect(parseStepSuggestion({ ...valid, name: 12 })).toMatchObject({ ok: false, field: 'name' });
	});
});

describe('suggestionFailure', () => {
	it('tells a lost connection from a refusal', () => {
		expect(suggestionFailure(503, new TypeError('Failed to fetch'))).toEqual({
			message: NETWORK_ERROR,
			kind: 'error'
		});
	});

	it('says a session ended, and that the server takes no suggestion', () => {
		expect(suggestionFailure(401, 'Unauthorized').kind).toBe('signed-out');
		expect(suggestionFailure(404, 'Step suggestions are not enabled on this server')).toEqual({
			message: 'Suggestions are not available right now.',
			kind: 'off'
		});
	});

	it('puts a rule the API refused at its field', () => {
		expect(
			suggestionFailure(422, {
				type: 'validation',
				on: 'body',
				property: 'description',
				message: 'This is at most 1500 characters.'
			})
		).toEqual({ message: 'This is at most 1500 characters.', field: 'description', kind: 'error' });
		// A field this form does not have, or no message
		for (const value of [{ property: 'constructor', message: 'x' }, { property: 'name' }, 'nope']) {
			expect(suggestionFailure(422, value)).toEqual({
				message: 'Check your suggestion and try again.',
				kind: 'error'
			});
		}
	});

	it('shows the limit and the outage as the API words them', () => {
		expect(
			suggestionFailure(429, 'You can send 3 suggestions a day: try again tomorrow').message
		).toBe('You can send 3 suggestions a day: try again tomorrow');
		expect(suggestionFailure(429, undefined).message).toBe(
			'Too many suggestions for today. Try again tomorrow.'
		);
		expect(
			suggestionFailure(503, 'Your suggestion could not be sent right now, try again later').message
		).toBe('Your suggestion could not be sent right now, try again later');
		expect(suggestionFailure(500, 'Internal Server Error').message).toBe(SUGGESTION_SEND_FAILED);
		expect(suggestionFailure(undefined, undefined).message).toBe(SUGGESTION_SEND_FAILED);
	});
});
