import { describe, expect, it } from 'bun:test';
import { PHONE_LIMITS, cleanPhoneNumber, isPhoneNumber } from 'portfolio-common';

// The number a visitor gives to book a phone meeting (portfolio-common's phone.ts), as the API
// checks it and the booking form does before sending it
describe('phone numbers', () => {
  it('takes numbers written the usual ways, from anywhere', () => {
    for (const number of ['+33 6 12 34 56 78', '06 12 34 56 78', '06.12.34.56.78', '+1 (415) 555-0100', '+44 20 7946 0958', '123456']) {
      expect({ number, ok: isPhoneNumber(cleanPhoneNumber(number)) }).toEqual({ number, ok: true });
    }
  });

  it('refuses what is not one', () => {
    for (const number of ['', '   ', 'call me', '12345', '+33 6 12 34 56 78 90 12 34', '33+612345678', '06 12 34 56 78 ext 2', '+33 6 12 34 56 78​', 'tel:+33612345678', '1'.repeat(PHONE_LIMITS.maxLength + 1)]) {
      expect({ number, ok: isPhoneNumber(cleanPhoneNumber(number)) }).toEqual({ number, ok: false });
    }
  });

  it('keeps what was typed, its spaces evened', () => {
    expect(cleanPhoneNumber('  +33  6\t12 34 56 78 ')).toBe('+33 6 12 34 56 78');
  });
});
