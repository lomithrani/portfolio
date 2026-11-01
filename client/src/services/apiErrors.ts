/**
 * HTTP status of an Eden Treaty error. Eden only types the statuses a route declares (often
 * just 422 for validation), while at runtime any status can come back: 401 from the auth guard,
 * 404 for unknown domains, 503 when the API cannot be reached, etc.
 */
export const errorStatus = (error: { status: unknown } | null | undefined): number | undefined =>
	typeof error?.status === 'number' ? error.status : undefined;
