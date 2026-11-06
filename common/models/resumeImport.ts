// Time limits of a résumé import (POST /experiences/import), shared by the API
// (its deadlines) and the browser (how long it waits for the answer). The
// browser must outlast the API: once the paid call is sent the import counts,
// so an answer the browser stopped waiting for is an import lost.
export const RESUME_IMPORT_TIMEOUTS = {
	/** Counting the PDF's tokens (free), its retry and any wait the API asks for included */
	countMs: 30_000,
	/** The paid call: from sending the request to the end of Claude's answer */
	extractMs: 180_000,
	/**
	 * What the browser allows on top: uploading the body (~5.4 MB for a 4 MB PDF, about 45 s
	 * at 1 Mbit/s), the API's checks and quotas, and the answer's way back
	 */
	clientMarginMs: 60_000
} as const;

/** How long the browser waits for an import: the API's worst case, plus the margin above */
export const RESUME_IMPORT_CLIENT_TIMEOUT_MS =
	RESUME_IMPORT_TIMEOUTS.countMs +
	RESUME_IMPORT_TIMEOUTS.extractMs +
	RESUME_IMPORT_TIMEOUTS.clientMarginMs;
