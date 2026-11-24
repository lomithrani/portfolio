import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** The button once the text is copied, for a while */
	copied: { en: 'Copied', fr: 'Copié' },
	/** Read out once the text is copied: `label` names it ("Your reply, in English") */
	copiedAnnouncement: {
		en: (label: string) => `Copied: ${label}`,
		fr: (label: string) => `Copié : ${label}`
	},
	/** The browser refused to copy: the text is selected in its field */
	copyYourself: {
		en: 'Your browser did not let the page copy it: the text is selected, copy it yourself.',
		fr: "Votre navigateur n'a pas laissé la page le copier : le texte est sélectionné, copiez-le vous-même."
	}
});
