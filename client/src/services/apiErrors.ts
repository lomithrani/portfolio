/**
 * HTTP status of an Eden Treaty error. Eden only types the statuses a route declares (often
 * just 422 for validation), while at runtime any status can come back: 401 from the auth guard,
 * 404 for unknown domains, 503 when the API cannot be reached, etc.
 */
export const errorStatus = (error: { status: unknown } | null | undefined): number | undefined =>
	typeof error?.status === 'number' ? error.status : undefined;

// Body of the API's 404 for GET /domain/:name when no domain has that name
// (DomainDoesNotExistError). Any other 404 (route miss, wrong API URL, a proxy or the hosting
// edge answering) means the API could not be asked, not that the domain is free.
const DOMAIN_NOT_FOUND = 'Domain not found';

/** Whether the API answered that the requested domain does not exist. */
export const isDomainNotFound = (
	error: { status: unknown; value?: unknown } | null | undefined
): boolean =>
	errorStatus(error) === 404 &&
	typeof error?.value === 'string' &&
	error.value.trim() === DOMAIN_NOT_FOUND;

// Body of the API's 409 when a booked slot is no longer free or bookable (SlotUnavailableError).
// Any other 409 on a booking means the owner's calendar cannot take bookings right now: not
// connected, or Google refused its access and the owner has to reconnect.
const SLOT_UNAVAILABLE = 'This slot is no longer available';

/** Whether the API answered that the requested slot was taken meanwhile. */
export const isSlotUnavailable = (
	error: { status: unknown; value?: unknown } | null | undefined
): boolean =>
	errorStatus(error) === 409 &&
	typeof error?.value === 'string' &&
	error.value.trim() === SLOT_UNAVAILABLE;
