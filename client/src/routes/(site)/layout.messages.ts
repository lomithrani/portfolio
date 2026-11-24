// The header of the site's own pages
import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	home: {
		/**
		 * The header's subtitle on the landing page: what a portfolio is (a career tool kept whether
		 * one is looking or not, like the Share tab's intro), never the hero's headline, which comes
		 * right under it (the link previews' og:title is that headline: +page.svelte)
		 */
		subtitle: {
			en: 'The career page you keep',
			fr: 'La page de carrière que vous gardez'
		}
	},
	legal: {
		title: { en: 'Legal', fr: 'Informations légales' },
		subtitle: {
			en: 'Legal notice, privacy, terms and cookies',
			fr: 'Mentions légales, confidentialité, conditions et cookies'
		}
	},
	account: {
		title: { en: 'Your account', fr: 'Votre compte' },
		subtitle: {
			en: 'Your data, the terms you accepted, deletion',
			fr: 'Vos données, les conditions acceptées, la suppression'
		}
	}
});
