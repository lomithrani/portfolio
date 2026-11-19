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
	/**
	 * A caption under the field and its "Copy your link" button: what the portfolio's link opens,
	 * where "your link" could be read as the address of the page for recruiters. Shown on the Share
	 * tab, in the owner's preview of their page for recruiters, and on the landing card's step 4 and
	 * ready state (`stacked`: the button under the field). It follows the button, its antecedent
	 * (« Il » is « votre lien »)
	 */
	opens: {
		en: 'It opens your portfolio. From there, “Propose a role” leads recruiters to your page for recruiters.',
		fr: 'Il ouvre votre portfolio. De là, « Proposer un poste » mène les recruteurs à votre page recruteurs.'
	},
	/** The browser refused to copy: the link is selected in its field */
	copyYourself: {
		en: 'Your browser did not let the page copy it: the link is selected, copy it yourself.',
		fr: "Votre navigateur n'a pas laissé la page le copier : le lien est sélectionné, copiez-le vous-même."
	}
});
