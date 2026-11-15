import { defineMessages, intlLocale } from 'portfolio-common';

/** A count as the page's language writes it: '5,000', '5 000' */
const count = (value: number) => value.toLocaleString(intlLocale('en-US'));

const maxLength = {
	en: (max: number) => `Use ${count(max)} characters or fewer.`,
	fr: (max: number) => `Utilisez ${count(max)} caractères au maximum.`
};

// The experience editor's own words: the names of its fields (its labels, and what names a field
// in the error summary) and what its validation says. The API's messages come in the page's
// language too, and are shown as they are.
export const m = defineMessages({
	/** A field of the form, by its key (the last part of a project's: 'name', 'hardSkills') */
	fields: {
		title: { en: 'Title', fr: 'Titre' },
		'company.name': { en: 'Company', fr: 'Entreprise' },
		location: { en: 'Location', fr: 'Lieu' },
		start: { en: 'Start', fr: 'Début' },
		end: { en: 'End', fr: 'Fin' },
		summary: { en: 'Summary', fr: 'Résumé' },
		icon: { en: 'Logo', fr: 'Logo' },
		projects: { en: 'Projects', fr: 'Projets' },
		name: { en: 'Name', fr: 'Nom' },
		hardSkills: { en: 'Technical skills', fr: 'Compétences techniques' },
		softSkills: { en: 'Soft skills', fr: 'Savoir-être' }
	},
	/** A project's field in the error summary: 'Project 2 · Name' */
	projectField: {
		en: (position: number, name: string) => `Project ${position} · ${name}`,
		fr: (position: number, name: string) => `Projet ${position} · ${name}`
	},
	/** A field and its problem in a line: 'End: Choose the end month, or tick …' */
	fieldProblem: {
		en: (label: string, message: string) => `${label}: ${message}`,
		fr: (label: string, message: string) => `${label} : ${message}`
	},
	/** The "ongoing" checkbox: of a professional experience, of any other one and of a project */
	ongoing: {
		professional: { en: 'I currently work here', fr: "J'y travaille actuellement" },
		other: { en: 'Ongoing', fr: 'En cours' }
	},
	errors: {
		titleRequired: { en: 'Enter a title.', fr: 'Saisissez un titre.' },
		projectNameRequired: { en: 'Enter a project name.', fr: 'Saisissez un nom de projet.' },
		maxLength,
		monthIncomplete: {
			en: 'Choose both a month and a year.',
			fr: 'Choisissez un mois et une année.'
		},
		startRequired: { en: 'Choose the start month.', fr: 'Choisissez le mois de début.' },
		/** `ongoing`: the label of the checkbox that says there is no end month */
		endRequired: {
			en: (ongoing: string) => `Choose the end month, or tick “${ongoing}”.`,
			fr: (ongoing: string) => `Choisissez le mois de fin, ou cochez « ${ongoing} ».`
		},
		endBeforeStart: {
			en: 'The end month must not be before the start month.',
			fr: 'Le mois de fin ne doit pas précéder le mois de début.'
		},
		iconTooLarge: {
			en: 'This image is too large: choose a smaller one.',
			fr: 'Cette image est trop volumineuse : choisissez-en une plus petite.'
		},
		tooManyProjects: {
			en: (max: number) => `Keep ${max} projects or fewer.`,
			fr: (max: number) => `Gardez ${max} projets au maximum.`
		},
		tooManySkills: {
			en: (max: number) => `Keep ${max} skills or fewer.`,
			fr: (max: number) => `Gardez ${max} compétences au maximum.`
		},
		/** `skill`: the start of the skill's name */
		skillTooLong: {
			en: (skill: string, max: number) => `“${skill}…” is too long: ${maxLength.en(max)}`,
			fr: (skill: string, max: number) =>
				`« ${skill}… » est trop long : ${count(max)} caractères au maximum.`
		}
	}
});
