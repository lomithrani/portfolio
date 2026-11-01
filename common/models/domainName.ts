// Shared rules for portfolio domain names (the `[domain]` URL segment).
// Used by the API to validate claims and by the client to decide whether an
// unknown path is a claimable domain or just a 404 (e.g. scanner probes).

export const DOMAIN_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9.-]{0,61}[a-z0-9])?$/;

// Top-level route segments and words that must never become a domain name.
export const RESERVED_DOMAIN_NAMES: ReadonlySet<string> = new Set([
	'admin',
	'api',
	'app',
	'experiences',
	'health',
	'healthz',
	'hire',
	'login',
	'logout',
	'swagger',
	'openapi',
	'www'
]);

// Names that look like file requests (wp-login.php, config.json, ...) are
// almost always vulnerability scanners, never people.
const FILE_EXTENSION_PATTERN =
	/\.(php\d?|asp|aspx|jsp|cgi|env|json|xml|txt|html?|js|map|sql|bak|old|zip|gz|tar|ini|ya?ml|log|git|cfg|conf)$/;

export const normalizeDomainName = (name: string): string => name.trim().toLowerCase();

export const isValidDomainName = (name: string): boolean => {
	const normalized = normalizeDomainName(name);
	return (
		DOMAIN_NAME_PATTERN.test(normalized) &&
		!normalized.includes('..') &&
		!FILE_EXTENSION_PATTERN.test(normalized) &&
		!RESERVED_DOMAIN_NAMES.has(normalized)
	);
};
