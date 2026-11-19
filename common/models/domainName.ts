// Shared rules for portfolio domain names (the `[domain]` URL segment).
// Used by the API to validate claims and by the client to decide whether an
// unknown path is a claimable domain or just a 404 (e.g. scanner probes).

export const DOMAIN_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9.-]{0,61}[a-z0-9])?$/;

// Top-level route segments and words that must never become a domain name.
export const RESERVED_DOMAIN_NAMES: ReadonlySet<string> = new Set([
	'about',
	'account',
	'admin',
	'api',
	'app',
	'contact',
	'cookies',
	'experiences',
	'health',
	'healthz',
	'help',
	'hire',
	'jobs',
	'legal',
	'login',
	'logout',
	'me',
	'opportunities',
	'privacy',
	'recruiter',
	'report',
	'signup',
	'start',
	'swagger',
	'terms',
	'openapi',
	'www'
]);

// Names that look like file requests (wp-login.php, config.json, ...) are
// almost always vulnerability scanners, never people. The pictures, icons and
// videos are those the web app serves at its root (client/static: favicon.png,
// logo.svg, og-image.png, og-hire.png...): the bare address of a portfolio with
// such a name would serve the file, which answers before any route.
const FILE_EXTENSION_PATTERN =
	/\.(php\d?|asp|aspx|jsp|cgi|env|json|xml|txt|html?|js|map|sql|bak|old|zip|gz|tar|ini|ya?ml|log|git|cfg|conf|png|jpe?g|gif|svg|webp|avif|ico|webm|mp4)$/;

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
