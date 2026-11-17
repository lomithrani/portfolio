import { describe, it, expect } from 'vitest';
import {
	SOON_MINUTES,
	meetingDayText,
	meetingJoinLink,
	meetingLocationText,
	meetingPhase,
	meetingTimeText,
	meetingTitle
} from '../bookedMeetings';
import { m } from '../bookedMeetings.messages';

const meeting = (overrides: Partial<Parameters<typeof meetingLocationText>[0]> = {}) => ({
	start: '2026-11-18T09:00:00.000Z',
	end: '2026-11-18T10:00:00.000Z',
	title: 'Intro call',
	location: 'google_meet' as const,
	locationDetails: null,
	meetLink: 'https://meet.google.com/abc-defg-hij',
	...overrides
});

describe('meetingPhase', () => {
	const start = new Date('2026-11-18T09:00:00Z');
	const at = (minutesFromStart: number) => new Date(start.getTime() + minutesFromStart * 60_000);

	it('says when a meeting is under way, starting soon or later', () => {
		expect(meetingPhase(meeting(), at(-SOON_MINUTES - 1))).toBe('later');
		expect(meetingPhase(meeting(), at(-SOON_MINUTES))).toBe('soon');
		expect(meetingPhase(meeting(), at(-1))).toBe('soon');
		expect(meetingPhase(meeting(), at(0))).toBe('now');
		expect(meetingPhase(meeting(), at(59))).toBe('now');
		// Eden Treaty gives Dates
		expect(meetingPhase({ start, end: at(60) }, at(30))).toBe('now');
	});
});

describe('meetingDayText and meetingTimeText', () => {
	const now = new Date('2026-11-16T12:00:00Z');

	it('names the day, with the year only when it is not this one', () => {
		expect(meetingDayText('2026-11-18T09:00:00Z', now, 'Europe/Paris')).toBe('Wed 18 Nov');
		expect(meetingDayText(new Date('2027-01-05T09:00:00Z'), now, 'Europe/Paris')).toBe(
			'Tue, 5 Jan 2027'
		);
	});

	it('gives the hours in a named time zone', () => {
		expect(meetingTimeText('2026-11-18T09:00:00Z', '2026-11-18T10:00:00Z', 'Europe/Paris')).toMatch(
			/^10:00\s*–\s*11:00\sCET$/
		);
	});
});

describe('meetingTitle', () => {
	it("falls back when the candidate's schedule is gone", () => {
		expect(meetingTitle({ title: 'Intro call' })).toBe('Intro call');
		expect(meetingTitle({ title: null })).toBe(m.untitled);
		expect(meetingTitle({ title: '  ' })).toBe(m.untitled);
	});
});

describe('meetingLocationText', () => {
	it('says nothing for a Google Meet meeting with its link', () => {
		expect(meetingLocationText(meeting())).toBeNull();
		expect(meetingLocationText(meeting({ meetLink: null }))).toBe(m.meetLinkInInvitation);
	});

	it('gives what the candidate wrote for a meeting outside Google Meet, else where it is', () => {
		expect(
			meetingLocationText(meeting({ location: 'phone', locationDetails: '+33 1 23 45 67 89' }))
		).toBe('By phone: +33 1 23 45 67 89');
		expect(
			meetingLocationText(meeting({ location: 'in_person', locationDetails: '1 rue de Rivoli' }))
		).toBe('In person: 1 rue de Rivoli');
		expect(meetingLocationText(meeting({ location: 'custom', locationDetails: 'Zoom' }))).toBe(
			'Zoom'
		);
		expect(meetingLocationText(meeting({ location: 'in_person' }))).toBe(
			m.locationUnstated.in_person
		);
	});
});

describe('meetingJoinLink', () => {
	it("links only Google Meet's own addresses", () => {
		expect(meetingJoinLink(meeting())).toBe('https://meet.google.com/abc-defg-hij');
		expect(meetingJoinLink({ meetLink: null })).toBeNull();
		expect(meetingJoinLink({ meetLink: 'http://meet.google.com/abc' })).toBeNull();
		expect(meetingJoinLink({ meetLink: 'https://meet.google.com.evil.example/abc' })).toBeNull();
		expect(meetingJoinLink({ meetLink: 'javascript:alert(1)' })).toBeNull();
		expect(meetingJoinLink({ meetLink: 'not a url' })).toBeNull();
	});
});
