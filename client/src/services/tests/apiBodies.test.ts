import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as bodies from '../apiBodies';

// The API's bodies the client matches (#services/apiBodies.ts) are the server's: one renamed there
// fails here, rather than turning a failure the client tells apart (Undo stopped, a card dropped, a
// posting changed meanwhile) into a generic one

/** Where the server declares each (server/protocol.ts, but two kept where they are thrown) */
const DECLARED_IN: Record<keyof typeof bodies, string> = {
	JOB_CHANGED: 'protocol.ts',
	JOB_TERMS_LOCKED: 'protocol.ts',
	JOB_NOT_FOUND: 'services/jobPostings.ts',
	RECRUITER_REQUIRED: 'services/recruiters.ts',
	MATCHING_NEEDS_OPEN_JOB: 'protocol.ts',
	NOT_PROPOSED_TO_RECRUITERS: 'protocol.ts',
	JOB_NOT_PROPOSED: 'protocol.ts',
	MUTUAL_INTEREST_EXISTS: 'protocol.ts',
	CANDIDATE_UNAVAILABLE: 'protocol.ts',
	DECISION_NOT_FOUND: 'protocol.ts',
	DECISION_FINAL: 'protocol.ts',
	MATCH_NOT_FOUND: 'protocol.ts',
	JOB_OF_MUTUAL_INTEREST: 'protocol.ts'
};

const server = (path: string) =>
	readFileSync(new URL(`../../../../server/${path}`, import.meta.url), 'utf8');

describe('the API’s bodies the client matches', () => {
	it.each(Object.entries(bodies))('keeps %s the same as the server', (name, value) => {
		const file = DECLARED_IN[name as keyof typeof bodies];
		expect(file, `Say where the server declares ${name}`).toBeDefined();
		// `export const X = '…'` (or a constant of the module, RECRUITER_REQUIRED), with or without
		// the server's semicolon
		const declared = new RegExp(`(?:export )?const ${name} = '([^']*)';?\\n`).exec(server(file));
		expect(declared?.[1], `${name} in server/${file}`).toBe(value);
	});
});
