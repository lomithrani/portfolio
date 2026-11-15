import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	title: { en: 'Leave without saving?', fr: 'Quitter sans enregistrer ?' },
	description: {
		en: 'Your changes are not saved yet. They stay in this browser as a draft, and come back when you return to this page.',
		fr: 'Vos modifications ne sont pas encore enregistrées. Elles restent dans ce navigateur comme brouillon, et reviennent quand vous retournez sur cette page.'
	},
	discard: { en: 'Discard changes', fr: 'Abandonner' },
	leave: { en: 'Leave', fr: 'Quitter' },
	stay: { en: 'Keep editing', fr: 'Rester' }
});
