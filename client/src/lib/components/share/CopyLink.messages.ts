import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** The field holding the link, for screen readers */
	label: { en: 'Your link', fr: 'Votre lien' },
	copy: { en: 'Copy your link', fr: 'Copier votre lien' },
	/** The button for a while once the link is copied */
	copied: { en: 'Link copied', fr: 'Lien copié' },
	/** Read out once the link is copied */
	copiedAnnouncement: {
		en: (link: string) => `Link copied: ${link}`,
		fr: (link: string) => `Lien copié : ${link}`
	},
	/** The browser refused to copy: the link is selected in its field */
	copyYourself: {
		en: 'Your browser did not let the page copy it: the link is selected, copy it yourself.',
		fr: "Votre navigateur n'a pas laissé la page le copier : le lien est sélectionné, copiez-le vous-même."
	}
});
