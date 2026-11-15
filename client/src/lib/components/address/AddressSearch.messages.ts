import { defineMessages, plural } from 'portfolio-common';

/** The address search of the forms that take an address (AddressSearch.svelte) */
export const m = defineMessages({
	/** Name of the list of addresses found */
	suggestions: { en: 'Suggestions', fr: 'Suggestions' },
	/** Announced to screen readers when the list shows */
	found: {
		en: (count: number) =>
			`${count} ${plural(count, 'address', 'addresses')} found. Use the up and down arrows, then Enter to pick one.`,
		fr: (count: number) =>
			`${count} ${plural(count, 'adresse trouvée', 'adresses trouvées')}. Utilisez les flèches haut et bas, puis Entrée pour en choisir une.`
	},
	none: {
		en: 'No address found for what you typed. Check the spelling, or add the town.',
		fr: "Aucune adresse trouvée pour ce que vous avez saisi. Vérifiez l'orthographe, ou ajoutez la ville."
	},
	unavailable: {
		en: 'Addresses cannot be searched right now. You can still type yours.',
		fr: 'Impossible de rechercher une adresse pour le moment. Vous pouvez tout de même saisir la vôtre.'
	},
	/** Under the list: where the addresses come from */
	source: {
		en: 'Addresses from the Géoplateforme (IGN), France only.',
		fr: 'Adresses de la Géoplateforme (IGN), France uniquement.'
	}
});
