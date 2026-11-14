import { defineEnvVars } from '@sveltejs/kit/env';
import { DEFAULT_GOOGLE_CLIENT_ID } from 'portfolio-common';

const DEFAULT_API_URL = 'http://localhost:3000';
// SvelteKit validates the environment more than once at startup: warn once
let warnedAboutApiUrl = false;
let warnedAboutLegal = false;

/** Trimmed value, undefined when unset or blank */
const optional = (value: string | undefined) => value?.trim() || undefined;

// The legal notice and the privacy policy must name the publisher and give a contact: without
// them the pages say "Publisher details are not configured yet." (never a made-up identity), and a
// production server says so once in its log
const warnLegalNotConfigured = (problem: string) => {
	if (!import.meta.env.PROD || warnedAboutLegal) return;
	warnedAboutLegal = true;
	console.warn(
		`${problem}: the legal notice and the privacy policy show "Publisher details are not configured yet." until LEGAL_PUBLISHER_NAME and LEGAL_CONTACT_EMAIL are set`
	);
};

export const variables = defineEnvVars({
	PUBLIC_PORTFOLIO_API_URL: {
		public: true,
		description: 'Base URL of the Elysia API',
		schema: (value) => {
			const url = value?.trim();
			if (url) return url;
			// The default only suits local development: in production every browser would call
			// (and send Google ID tokens to) its own localhost
			if (import.meta.env.PROD && !warnedAboutApiUrl) {
				warnedAboutApiUrl = true;
				console.warn(
					`PUBLIC_PORTFOLIO_API_URL is not set: falling back to ${DEFAULT_API_URL}, which only works in local development`
				);
			}
			return DEFAULT_API_URL;
		}
	},
	PUBLIC_GOOGLE_CLIENT_ID: {
		public: true,
		description:
			'OAuth 2.0 client ID used by Google Sign-In (must match the API GOOGLE_CLIENT_ID audience)',
		schema: (value) => value?.trim() || DEFAULT_GOOGLE_CLIENT_ID
	},
	// Publisher of the site and data controller, shown on the legal pages ((site)/legal). Server
	// only: read by (site)/legal/+layout.server.ts
	LEGAL_PUBLISHER_NAME: {
		public: false,
		description:
			'Name of the publisher and data controller (a person or a company), shown in the legal notice and the privacy policy',
		schema: (value) => {
			const name = optional(value);
			if (!name) warnLegalNotConfigured('LEGAL_PUBLISHER_NAME is not set');
			return name;
		}
	},
	LEGAL_CONTACT_EMAIL: {
		public: false,
		description:
			'Contact email of the publisher: users, authorities (DSA), privacy requests and reports of illegal content',
		schema: (value) => {
			const email = optional(value);
			// A typo must not take the site down: the pages then say the details are not configured
			if (email && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) return email;
			warnLegalNotConfigured(
				email ? 'LEGAL_CONTACT_EMAIL is not an email address' : 'LEGAL_CONTACT_EMAIL is not set'
			);
			return undefined;
		}
	},
	LEGAL_PUBLISHER_ADDRESS: {
		public: false,
		description: 'Postal address of the publisher (optional; one line)',
		schema: optional
	},
	LEGAL_PUBLISHER_PHONE: {
		public: false,
		description: 'Phone number of the publisher (optional)',
		schema: optional
	},
	LEGAL_PUBLISHER_SIREN: {
		public: false,
		description:
			'SIREN/SIRET of the publisher (optional): when set, the legal notice presents the publisher as a professional',
		schema: optional
	},
	LEGAL_PUBLISHER_VAT: {
		public: false,
		description: 'Intra-community VAT number of the publisher (optional)',
		schema: optional
	},
	LEGAL_PUBLICATION_DIRECTOR: {
		public: false,
		description: 'Director of publication (optional, defaults to LEGAL_PUBLISHER_NAME)',
		schema: optional
	}
});
