// The header of the site's own pages
import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	home: {
		/**
		 * The landing page's headline in one line (page.messages.ts `hero`, where its
		 * `headlineAccent` says what backs it): the header's subtitle there, and the title of its
		 * link previews (og:title)
		 */
		subtitle: {
			en: 'Your career, on your terms. The pay first, the call after.',
			fr: "Votre carrière, à vos conditions. La rémunération d'abord, l'appel ensuite."
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
