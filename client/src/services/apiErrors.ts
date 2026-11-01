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
