import { defineMessages } from '../i18n';

export const skillMessages = defineMessages({
	/** The heading of each category of the skill catalogue (SKILL_CATEGORIES, skills.ts) */
	category: {
		language: { en: 'Languages', fr: 'Langages' },
		framework: { en: 'Frameworks & runtimes', fr: 'Frameworks et runtimes' },
		infrastructure: { en: 'Cloud & infrastructure', fr: 'Cloud et infrastructure' },
		data: { en: 'Data & observability', fr: 'Données et observabilité' },
		security: { en: 'Identity & security', fr: 'Identité et sécurité' },
		practice: { en: 'Practices & domains', fr: 'Pratiques et domaines' },
		tool: { en: 'Tools', fr: 'Outils' },
		soft: { en: 'Soft skills', fr: 'Savoir-être' },
		other: { en: 'Other', fr: 'Autres' }
	}
});
