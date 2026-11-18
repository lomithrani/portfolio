import { defineMessages } from 'portfolio-common';

// Shared by the job editor's fields (Field.svelte, ListInput.svelte and the editor's own choices)
export const m = defineMessages({
	/**
	 * How screen readers hear a field of the terms of a job description opened before (its lock
	 * icon is not read): it cannot be changed
	 */
	locked: {
		en: 'Locked since the job description was opened.',
		fr: "Verrouillé depuis l'ouverture de l'offre."
	}
});
