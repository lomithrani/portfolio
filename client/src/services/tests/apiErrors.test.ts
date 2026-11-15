import { describe, it, expect } from 'vitest';
import { isSlotUnavailable } from '../apiErrors';

describe('isSlotUnavailable', () => {
	it('recognizes the API answer for a slot taken meanwhile', () => {
		expect(isSlotUnavailable({ status: 409, value: 'This slot is no longer available' })).toBe(
			true
		);
	});

	it.each([
		// The owner's calendar cannot take bookings: not a slot conflict
		[
			'a calendar to reconnect',
			{
				status: 409,
				value: 'Google Calendar access was revoked or has expired. Reconnect Google Calendar'
			}
		],
		['a disconnected calendar', { status: 409, value: 'Google Calendar not connected' }],
		[
			'another status with the same body',
			{ status: 429, value: 'This slot is no longer available' }
		],
		['a 409 without a body', { status: 409 }],
		['no error', null]
	])('ignores %s', (_, error) => {
		expect(isSlotUnavailable(error)).toBe(false);
	});
});
