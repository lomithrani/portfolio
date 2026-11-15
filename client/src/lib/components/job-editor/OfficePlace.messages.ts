import { defineMessages } from 'portfolio-common';

/** Where travel times to a job's office are counted to, as the map found it (OfficePlace.svelte) */
export const m = defineMessages({
	/** `place`: the address as the map service writes it */
	street: {
		en: (place: string) => `Found on the map: ${place}. Travel times are counted to this address.`,
		fr: (place: string) =>
			`Trouvée sur la carte : ${place}. Les temps de trajet sont calculés jusqu'à cette adresse.`
	},
	/** A street was typed, and only its town is found. `town`: the town as the map service writes it */
	streetNotFound: {
		en: (town: string) =>
			`This street was not found on the map: travel times are counted to the centre of ${town}. Pick the address in the list, or check its spelling.`,
		fr: (town: string) =>
			`Cette rue est introuvable sur la carte : les temps de trajet sont calculés jusqu'au centre de ${town}. Choisissez l'adresse dans la liste, ou vérifiez son orthographe.`
	},
	/** No street typed */
	town: {
		en: (town: string) => `Without a street, travel times are counted to the centre of ${town}.`,
		fr: (town: string) => `Sans rue, les temps de trajet sont calculés jusqu'au centre de ${town}.`
	},
	none: {
		en: 'This place was not found on the map: no travel time can be computed for this job, and candidates who rate the commute see it as not stated. Check the city and the address.',
		fr: "Ce lieu est introuvable sur la carte : aucun temps de trajet ne peut être calculé pour cette offre, et les candidats qui notent le trajet le voient comme non précisé. Vérifiez la ville et l'adresse."
	}
});
