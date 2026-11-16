import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

// vi.mock factories are hoisted: they cannot reference outer variables
vi.mock('#services', () => ({
	portfolioApi: { feedback: { get: vi.fn(), post: vi.fn() } }
}));

import { portfolioApi } from '#services';
import { networkError } from '../recruiter';
import {
	closeFeedback,
	feedbackAvailability,
	feedbackContext,
	feedbackDialog,
	feedbackFailure,
	openFeedback,
	resetFeedbackAvailability,
	sendFeedback
} from '../feedback';
import { m } from '../feedback.messages';

const getMock = vi.mocked(portfolioApi.feedback.get);
const postMock = vi.mocked(portfolioApi.feedback.post);

beforeEach(() => {
	resetFeedbackAvailability();
	getMock.mockReset();
	postMock.mockReset();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('feedbackFailure', () => {
	it('says a request that got no answer is a connection problem', () => {
		expect(feedbackFailure(503, new TypeError('Failed to fetch'))).toEqual({
			ok: false,
			message: networkError()
		});
	});

	it('keeps the text for an expired session instead of signing out', () => {
		expect(feedbackFailure(401, 'Unauthorized')).toEqual({ ok: false, message: m.sessionExpired });
	});

	it('says the feature is off on a 404', () => {
		expect(feedbackFailure(404, 'NOT_FOUND')).toEqual({ ok: false, message: m.unavailable });
	});

	it('shows a 422 about the message under it, any other 422 above the buttons', () => {
		expect(
			feedbackFailure(422, { property: 'message', message: 'Write at least 10 characters.' })
		).toEqual({ ok: false, message: 'Write at least 10 characters.', field: 'message' });
		expect(feedbackFailure(422, { property: 'context', message: 'Nope' })).toEqual({
			ok: false,
			message: m.checkMessage
		});
		expect(feedbackFailure(422, 'Unprocessable')).toEqual({ ok: false, message: m.checkMessage });
	});

	it("passes on the API's own words for its limits and outages", () => {
		expect(feedbackFailure(429, ' 5 per day: try again tomorrow. ')).toEqual({
			ok: false,
			message: '5 per day: try again tomorrow.'
		});
		expect(feedbackFailure(429, undefined)).toEqual({ ok: false, message: m.tooMany });
		expect(feedbackFailure(503, 'GitHub did not answer.')).toEqual({
			ok: false,
			message: 'GitHub did not answer.'
		});
		expect(feedbackFailure(503, '')).toEqual({ ok: false, message: m.sendFailed });
		expect(feedbackFailure(500, 'boom')).toEqual({ ok: false, message: m.sendFailed });
		expect(feedbackFailure(undefined, undefined)).toEqual({ ok: false, message: m.sendFailed });
	});
});

describe('feedbackContext', () => {
	it('sends the route id, the window size and the theme, never the address', () => {
		vi.stubGlobal('window', { innerWidth: 390.4, innerHeight: 844 });
		vi.stubGlobal('document', { documentElement: { classList: { contains: () => true } } });
		expect(feedbackContext('/[domain]/experiences')).toEqual({
			route: '/[domain]/experiences',
			viewport: { width: 390, height: 844 },
			theme: 'dark'
		});
	});

	it('leaves out what is not known', () => {
		vi.stubGlobal('window', { innerWidth: 0, innerHeight: 0 });
		vi.stubGlobal('document', { documentElement: { classList: { contains: () => false } } });
		expect(feedbackContext(null)).toEqual({ theme: 'light' });
	});
});

describe('the dialog state', () => {
	it('opens with where the focus goes back, and closes keeping it', () => {
		const returnFocus = () => null;
		openFeedback(returnFocus);
		expect(get(feedbackDialog)).toEqual({ open: true, returnFocus });
		closeFeedback();
		expect(get(feedbackDialog)).toEqual({ open: false, returnFocus });
	});
});

describe('feedbackAvailability', () => {
	it('asks the server once per page load', async () => {
		getMock.mockResolvedValue({ data: { enabled: true, classifies: true }, error: null } as never);
		await expect(feedbackAvailability()).resolves.toEqual({ enabled: true, classifies: true });
		await expect(feedbackAvailability()).resolves.toEqual({ enabled: true, classifies: true });
		expect(getMock).toHaveBeenCalledTimes(1);
	});

	it('counts a server that could not be asked as off, and asks again later', async () => {
		getMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
		await expect(feedbackAvailability()).resolves.toEqual({ enabled: false, classifies: false });
		getMock.mockResolvedValue({ data: { enabled: true, classifies: false }, error: null } as never);
		await expect(feedbackAvailability()).resolves.toEqual({ enabled: true, classifies: false });
		expect(getMock).toHaveBeenCalledTimes(2);
	});
});

describe('sendFeedback', () => {
	it('sends the message and its context, and says what it was filed as', async () => {
		postMock.mockResolvedValue({
			data: {
				created: true,
				kind: 'bug',
				classified: true,
				issueUrl: 'https://github.com/lomithrani/portfolio/issues/12'
			},
			error: null
		} as never);
		const context = { route: '/(site)' };
		await expect(sendFeedback('The button does nothing', context)).resolves.toEqual({
			ok: true,
			kind: 'bug',
			issueUrl: 'https://github.com/lomithrani/portfolio/issues/12'
		});
		expect(postMock).toHaveBeenCalledWith(
			{ message: 'The button does nothing', context },
			{ fetch: { credentials: 'include' } }
		);
	});

	it('links nothing but GitHub, and reads an unknown kind as a task', async () => {
		postMock.mockResolvedValue({
			data: { created: true, kind: 'other', classified: false, issueUrl: 'javascript:alert(1)' },
			error: null
		} as never);
		await expect(sendFeedback('The button does nothing', {})).resolves.toEqual({
			ok: true,
			kind: 'task'
		});
	});

	it('says why the API refused it, and a failed request as a connection problem', async () => {
		postMock.mockResolvedValue({
			data: null,
			error: { status: 401, value: 'Unauthorized' }
		} as never);
		await expect(sendFeedback('The button does nothing', {})).resolves.toEqual({
			ok: false,
			message: m.sessionExpired
		});
		postMock.mockRejectedValue(new TypeError('Failed to fetch'));
		await expect(sendFeedback('The button does nothing', {})).resolves.toEqual({
			ok: false,
			message: networkError()
		});
	});
});
