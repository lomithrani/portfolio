import { describe, expect, it } from 'vitest';
import {
	LOCALES,
	MATCHING_LIMITS,
	matchingMessages,
	messageSource,
	withLocale,
	type MessageTree
} from 'portfolio-common';
import { emptyJobForm } from '../jobPosting';
import { networkError } from '../recruiter';
import {
	canProposeJob,
	deleteMatchingDetails,
	everInMatching,
	isMatchingLimitBody,
	jobMatchingLabel,
	jobMatchingState,
	leavingMatchingText,
	matchingFormErrors,
	readJobMatching,
	recruiterInterestFailure,
	sendsMatching,
	switchFailure
} from '../recruiterMatching';
import { m } from '../recruiterMatching.messages';
import { m as panel } from '#components/recruiter/MatchingPanel.messages.ts';
import { m as interests } from '#components/recruiter/RecruiterMatches.messages.ts';
import { m as menu } from '#components/AccountMenu.messages.ts';
import { m as editor } from '#components/job-editor/JobEditor.messages.ts';
import { m as candidatesPage } from '../../routes/(app)/recruiter/jobs/[id]/candidates/page.messages';

// The recruiter's side of matching (recruiterMatching.ts): where a job stands with the reviewers,
// why the switch was refused, what the editor asks of a job created in matching, and why the
// mutual interests could not be read. What a recruiter reads never counts candidates.

const REVIEWED = '2026-11-20T10:00:00.000Z';

describe('readJobMatching', () => {
	it('is null without matching (MATCHING off: nothing of it shows), or for what is not one', () => {
		expect(readJobMatching(undefined)).toBeNull();
		expect(readJobMatching(null)).toBeNull();
		expect(readJobMatching('on')).toBeNull();
		expect(readJobMatching({ enabledAt: null, review: { status: 'maybe' } })).toBeNull();
	});

	it('reads whether it is on and its review, a Date as Eden parsed it too', () => {
		expect(readJobMatching({ enabledAt: null, review: null })).toEqual({
			enabledAt: null,
			review: null
		});
		expect(
			readJobMatching({
				enabledAt: new Date(REVIEWED),
				review: { status: 'approved', requestedAt: REVIEWED, reviewedAt: REVIEWED, reason: null }
			})
		).toEqual({
			enabledAt: REVIEWED,
			review: { status: 'approved', reviewedAt: REVIEWED, reason: null }
		});
	});

	it('keeps the reason of a rejection only, as the reviewer wrote it', () => {
		const rejected = readJobMatching({
			enabledAt: REVIEWED,
			review: { status: 'rejected', reviewedAt: REVIEWED, reason: '  Say what the job is.  ' }
		});
		expect(rejected?.review).toEqual({
			status: 'rejected',
			reviewedAt: REVIEWED,
			reason: 'Say what the job is.'
		});
		const pending = readJobMatching({
			enabledAt: REVIEWED,
			review: { status: 'pending', reviewedAt: null, reason: 'left over' }
		});
		expect(pending?.review?.reason).toBeNull();
	});
});

describe('where a job stands in matching', () => {
	const on = (status: string | null) => ({
		enabledAt: REVIEWED,
		review: status ? { status: status as 'pending', reviewedAt: null, reason: null } : null
	});

	it('is off, in review, not accepted, on hold or proposed', () => {
		expect(jobMatchingState('open', { enabledAt: null, review: null })).toBe('off');
		expect(jobMatchingState('open', { enabledAt: null, review: on('approved').review })).toBe(
			'off'
		);
		expect(jobMatchingState('open', on('pending'))).toBe('pending');
		// Never reviewed (a record without a review): fails closed, in review
		expect(jobMatchingState('open', on(null))).toBe('pending');
		expect(jobMatchingState('open', on('rejected'))).toBe('rejected');
		expect(jobMatchingState('on_hold', on('rejected'))).toBe('rejected');
		expect(jobMatchingState('on_hold', on('approved'))).toBe('paused');
		expect(jobMatchingState('open', on('approved'))).toBe('live');
	});

	it('can be turned on for an open job only', () => {
		expect(canProposeJob('open')).toBe(true);
		for (const status of ['draft', 'on_hold', 'filled', 'closed'] as const) {
			expect(canProposeJob(status)).toBe(false);
		}
	});

	it('labels a job of the dashboard, never with a count, and nothing while off', () => {
		expect(jobMatchingLabel({ status: 'open' })).toBeNull();
		expect(
			jobMatchingLabel({ status: 'open', matching: { enabledAt: null, review: null } })
		).toBeNull();
		expect(jobMatchingLabel({ status: 'open', matching: on('approved') })).toBe(
			'Proposed to candidates'
		);
		expect(jobMatchingLabel({ status: 'open', matching: on('pending') })).toBe(
			'In review for candidates'
		);
		expect(jobMatchingLabel({ status: 'open', matching: on('rejected') })).toBe(
			'Not accepted for candidates'
		);
		expect(jobMatchingLabel({ status: 'on_hold', matching: on('approved') })).toBe(
			'Not proposed while on hold'
		);
		withLocale('fr', () => {
			expect(jobMatchingLabel({ status: 'open', matching: on('approved') })).toBe(
				'Proposée aux candidats'
			);
		});
	});
});

describe('switchFailure', () => {
	const property = (name: string) => ({ type: 'validation', property: name, message: 'x' });

	it('says each refusal of the switch in words', () => {
		expect(
			switchFailure(409, 'Only an open job description can be proposed to candidates')
		).toEqual({ kind: 'not-open', message: m.switchFailure.notOpen });
		expect(switchFailure(409, 'This job posting was changed since you opened it').kind).toBe(
			'changed'
		);
		// The route's other 409: the jobs a recruiter may propose at once (its text is the API's own)
		expect(switchFailure(409, 'You can propose 10 jobs to candidates at once')).toEqual({
			kind: 'limit',
			message: m.switchFailure.limit(MATCHING_LIMITS.matchingJobsPerRecruiter)
		});
		expect(switchFailure(422, property('company')).kind).toBe('company');
		expect(switchFailure(422, property('description')).kind).toBe('description');
		expect(switchFailure(422, property('pay.max')).kind).toBe('save-again');
		expect(switchFailure(422, property('matching')).kind).toBe('save-again');
		expect(switchFailure(422, property('consent')).kind).toBe('terms');
	});

	it('leaves the session, the space, the job gone and matching off to the page', () => {
		expect(switchFailure(401, 'Unauthorized').kind).toBe('signed-out');
		expect(switchFailure(403, 'Create your recruiter space first').kind).toBe('no-space');
		expect(switchFailure(404, 'Job posting not found').kind).toBe('gone');
		expect(switchFailure(404, 'NOT_FOUND').kind).toBe('off');
	});

	it('tries again after anything else, and when the request got no answer', () => {
		expect(switchFailure(500, 'boom')).toEqual({ kind: 'retry', message: m.switchFailure.retry });
		expect(switchFailure(503, new TypeError('fetch failed')).kind).toBe('retry');
		expect(switchFailure(403, 'Forbidden').kind).toBe('retry');
	});

	it('says the limit of the recruiter’s own jobs in both languages', () => {
		expect(m.switchFailure.limit(10)).toBe(
			'You can propose 10 job descriptions to candidates at once: stop proposing one to propose this one.'
		);
		withLocale('fr', () => {
			// French puts a no-break space before a colon (defineMessages)
			expect(m.switchFailure.limit(10).replace(/\s/g, ' ')).toBe(
				"Vous pouvez proposer 10 offres aux candidats à la fois : arrêtez d'en proposer une pour proposer celle-ci."
			);
		});
	});
});

describe('the job editor’s choice', () => {
	const form = (fields: Partial<ReturnType<typeof emptyJobForm>>) => ({
		...emptyJobForm(),
		...fields
	});

	it('asks a job created open and proposed for its company, then a description', () => {
		expect(matchingFormErrors(form({ status: 'open', description: 'Run it.' }), true)).toEqual({
			company: expect.stringContaining('Name the company')
		});
		expect(matchingFormErrors(form({ status: 'open', company: 'Acme' }), true)).toEqual({
			description: expect.stringContaining('Describe the job')
		});
		// With the other way out: unticking the choice
		expect(
			matchingFormErrors(form({ status: 'open', description: 'Run it.' }), true).company
		).toContain('Or untick “Propose it to candidates”.');
		expect(
			withLocale(
				'fr',
				() => matchingFormErrors(form({ status: 'open', company: 'Acme' }), true).description
			)
		).toContain('Ou décochez «\u00a0La proposer aux candidats\u00a0».');
		expect(
			matchingFormErrors(form({ status: 'open', company: 'Acme', description: 'Run it.' }), true)
		).toEqual({});
	});

	it('asks nothing when it is not proposed or not created open', () => {
		expect(matchingFormErrors(form({ status: 'open' }), false)).toEqual({});
		expect(matchingFormErrors(form({ status: 'draft' }), true)).toEqual({});
	});

	it('sends the choice only offered, ticked and created open', () => {
		const open = form({ status: 'open' });
		expect(sendsMatching(open, { offered: true, proposed: true })).toBe(true);
		expect(sendsMatching(open, { offered: false, proposed: true })).toBe(false);
		expect(sendsMatching(open, { offered: true, proposed: false })).toBe(false);
		expect(sendsMatching(form({ status: 'draft' }), { offered: true, proposed: true })).toBe(false);
	});
});

describe('isMatchingLimitBody', () => {
	it('tells the limit of jobs proposed at once from the limit of job descriptions, in either language', () => {
		for (const locale of LOCALES) {
			const body = withLocale(locale, () =>
				matchingMessages.job.tooMany(MATCHING_LIMITS.matchingJobsPerRecruiter)
			);
			expect(isMatchingLimitBody(body)).toBe(true);
			expect(isMatchingLimitBody(` ${body} `)).toBe(true);
		}
		expect(isMatchingLimitBody('You can keep 50 job descriptions at most.')).toBe(false);
		expect(isMatchingLimitBody('')).toBe(false);
		expect(isMatchingLimitBody(undefined)).toBe(false);
		expect(isMatchingLimitBody({ message: 'x' })).toBe(false);
	});
});

describe('what leaving matching takes', () => {
	const on = readJobMatching({ enabledAt: REVIEWED, review: { status: 'approved' } });
	const before = readJobMatching({ enabledAt: null, review: { status: 'pending' } });
	const never = readJobMatching({ enabledAt: null, review: null });

	it('is asked only of a job put into matching that a status takes out of it', () => {
		expect(everInMatching(on)).toBe(true);
		expect(everInMatching(before)).toBe(true);
		expect(everInMatching(never)).toBe(false);
		expect(everInMatching(null)).toBe(false);
		for (const to of ['filled', 'closed', 'draft'] as const) {
			expect(leavingMatchingText(on, 'open', to)).toContain('it stops being proposed');
			expect(leavingMatchingText(on, 'on_hold', to)).toContain('its mutual interests end');
			expect(leavingMatchingText(before, 'open', to)).toContain(
				'its mutual interests with candidates end, if it has any'
			);
		}
		// A status it keeps (open, on hold), one it had left already, a job never put into it, or
		// matching off (no `matching`): nothing to ask
		expect(leavingMatchingText(on, 'open', 'on_hold')).toBeNull();
		expect(leavingMatchingText(on, 'on_hold', 'open')).toBeNull();
		expect(leavingMatchingText(before, 'filled', 'closed')).toBeNull();
		expect(leavingMatchingText(never, 'open', 'filled')).toBeNull();
		expect(leavingMatchingText(null, 'open', 'filled')).toBeNull();
		expect(leavingMatchingText(on, 'open', 'closed')).toContain(
			'Opening it again does not bring them back.'
		);
	});

	it('adds to the deletion of a job put into matching that its matches go too', () => {
		expect(deleteMatchingDetails({ enabledAt: REVIEWED, review: null })).toContain(
			'mutual interests with candidates'
		);
		expect(deleteMatchingDetails({ enabledAt: null, review: { status: 'rejected' } })).not.toBe('');
		expect(deleteMatchingDetails({ enabledAt: null, review: null })).toBe('');
		expect(deleteMatchingDetails(undefined)).toBe('');
	});
});

describe('recruiterInterestFailure', () => {
	it('tells the session, the space, the terms, a mutual interest gone and matching off apart', () => {
		expect(recruiterInterestFailure({ status: 401, value: 'Unauthorized' })).toBe('signed-out');
		expect(
			recruiterInterestFailure({ status: 403, value: 'Create your recruiter space first' })
		).toBe('no-space');
		expect(
			recruiterInterestFailure({
				status: 422,
				value: { type: 'validation', property: 'consent', message: 'x' }
			})
		).toBe('terms');
		expect(recruiterInterestFailure({ status: 404, value: 'Match not found' })).toBe('gone');
		expect(recruiterInterestFailure({ status: 404, value: 'Job posting not found' })).toBe('gone');
		expect(recruiterInterestFailure({ status: 404, value: 'NOT_FOUND' })).toBe('off');
		expect(recruiterInterestFailure({ status: 503, value: new TypeError('fetch failed') })).toBe(
			'network'
		);
		expect(recruiterInterestFailure({ status: 500, value: 'boom' })).toBe('error');
		expect(networkError()).toBeTruthy();
	});
});

describe('what a recruiter reads of matching', () => {
	/** Every text of a group of messages, in a language: functions given words, never numbers */
	const texts = (tree: MessageTree | undefined): string[] =>
		Object.values(tree ?? {}).flatMap((node) => {
			if (typeof node === 'object' && node && 'en' in node && 'fr' in node) {
				return LOCALES.flatMap((locale) => {
					const entry = (node as Record<string, unknown>)[locale];
					return typeof entry === 'function' ? [entry('Staff engineer')] : [String(entry)];
				});
			}
			return texts(node as MessageTree);
		});

	it('never gives a recruiter a number, in either language', () => {
		const source = messageSource(m) as Record<string, MessageTree>;
		const failures = source.switchFailure as Record<string, MessageTree>;
		const menuSource = messageSource(menu) as Record<string, MessageTree>;
		const editorSource = messageSource(editor) as Record<string, MessageTree>;
		const recruiterTexts = [
			...texts(source.label),
			// The limit names how many of their own jobs they may propose at once: no count of candidates
			...texts({ ...failures, limit: undefined } as unknown as MessageTree),
			...texts(source.leaving),
			...texts(source.statusDialog),
			...texts({ deleteDetails: source.deleteDetails } as MessageTree),
			...texts(source.formErrors),
			...texts(messageSource(panel) as MessageTree),
			...texts(messageSource(interests) as MessageTree),
			...texts(messageSource(candidatesPage) as MessageTree),
			...texts({
				recruiterNew: menuSource.recruiterNew,
				recruiterNewLabel: menuSource.recruiterNewLabel
			} as MessageTree),
			...texts(editorSource.matching)
		];
		expect(recruiterTexts.length).toBeGreaterThan(60);
		for (const said of recruiterTexts) expect(said).not.toMatch(/\d/);
		// The badge of the account menu says new mutual interests in the recruiter space, never how many
		for (const locale of LOCALES) {
			withLocale(locale, () => {
				expect(menu.trigger.recruiter('Ada Lovelace', 0, true)).not.toMatch(/\d/);
			});
		}
		expect(menu.trigger.recruiter('Ada Lovelace', 0, true)).toBe(
			'Account menu: Ada Lovelace, Recruiter space, new mutual interests in your recruiter space'
		);
	});

	it('never calls a mutual interest a bare match, nor promises an email', () => {
		const all = [
			...texts(messageSource(m) as MessageTree),
			...texts(messageSource(panel) as MessageTree),
			...texts(messageSource(interests) as MessageTree),
			...texts(messageSource(candidatesPage) as MessageTree)
		];
		for (const said of all) {
			expect(said).not.toMatch(/\bmatch(es|ed)?\b|correspondance/i);
			expect(said).not.toMatch(/\be-?mail\b|courriel/i);
		}
	});
});
