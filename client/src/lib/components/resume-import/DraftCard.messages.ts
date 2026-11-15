import { defineMessages, plural } from 'portfolio-common';

// A draft's card in the résumé import's review
export const m = defineMessages({
	untitled: { en: 'Untitled experience', fr: 'Expérience sans titre' },
	/** Names the checkbox; `title`: the draft's */
	include: {
		en: (title: string) => `Include ${title}`,
		fr: (title: string) => `Inclure ${title}`
	},
	/** Names the Edit button */
	edit: {
		en: (title: string) => `Edit ${title}`,
		fr: (title: string) => `Modifier ${title}`
	},
	added: { en: 'Added', fr: 'Ajoutée' },
	projects: {
		en: (count: number) => `${count} ${plural(count, 'project', 'projects')}`,
		fr: (count: number) => `${count} ${plural(count, 'projet', 'projets')}`
	},
	skills: { en: 'Skills:', fr: 'Compétences :' },
	/** After the first skills, when the draft has `count` others */
	moreSkills: {
		en: (count: number) => `+${count} more`,
		fr: (count: number) => `+${count} ${plural(count, 'autre', 'autres')}`
	},
	duplicate: {
		en: 'Already in your portfolio: an experience has the same title and company.',
		fr: 'Déjà dans votre portfolio : une expérience a le même titre et la même entreprise.'
	},
	/** `error`: why the last attempt to add it failed */
	notAdded: {
		en: (error: string) => `Not added: ${error}`,
		fr: (error: string) => `Non ajoutée : ${error}`
	},
	/** `problems`: what the editor would refuse ('End: Choose the end month, …') */
	editFirst: {
		en: (problems: string) => `Edit before adding · ${problems}`,
		fr: (problems: string) => `À modifier avant d'ajouter · ${problems}`
	}
});
