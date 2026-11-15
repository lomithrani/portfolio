import { defineMessages, ExperienceType } from 'portfolio-common';

export const m = defineMessages({
	/**
	 * Badge labels of the experience types (in French they agree with « expérience » : une
	 * expérience professionnelle, personnelle)
	 */
	types: {
		[ExperienceType.Professional]: { en: 'Professional', fr: 'Professionnelle' },
		[ExperienceType.Personal]: { en: 'Personal', fr: 'Personnelle' },
		[ExperienceType.Educational]: { en: 'Education', fr: 'Formation' },
		[ExperienceType.Leisure]: { en: 'Leisure', fr: 'Loisirs' }
	}
});
