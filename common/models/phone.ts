// The phone number a visitor gives to book a phone meeting (POST /appointments/book, the Hire
// page's booking form): only written into the calendar invitation, never stored.

export const PHONE_LIMITS = {
	/** What the field takes, spaces and signs included */
	maxLength: 30,
	/** Digits of the shortest number taken (a short national number) */
	minDigits: 6,
	/** Digits of the longest (E.164: 15 with the country code) */
	maxDigits: 15
} as const;

/** The number as it goes into the invitation: trimmed, its runs of spaces as one */
export const cleanPhoneNumber = (raw: string): string => raw.replace(/\s+/g, ' ').trim();

/**
 * Whether a cleaned number is one: digits with spaces, dots, dashes or brackets between them, a
 * `+` only in front, 6 to 15 digits. Its country is not checked: a visitor may be anywhere
 */
export function isPhoneNumber(value: string): boolean {
	if (value.length === 0 || value.length > PHONE_LIMITS.maxLength) return false;
	if (!/^\+?[\d\s().-]+$/.test(value)) return false;
	const digits = value.replace(/\D/g, '').length;
	return digits >= PHONE_LIMITS.minDigits && digits <= PHONE_LIMITS.maxDigits;
}
