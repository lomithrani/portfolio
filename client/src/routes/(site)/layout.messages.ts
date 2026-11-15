// The header of the site's own pages
import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	home: {
		/**
		 * The landing page's headline in one line (page.messages.ts `hero`): the header's
		 * subtitle there, and the title of its link previews (og:title)
		 */
		subtitle: {
			en: 'Your portfolio, your way. No more calls about the wrong job.',
			fr: 'Votre portfolio, à votre image. Fini les appels pour le mauvais poste.'
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
