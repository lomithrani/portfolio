import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** The field's label, unless the editor gives another */
	label: { en: 'Job description', fr: 'Description du poste' },
	write: { en: 'Write', fr: 'Rédiger' },
	preview: { en: 'Preview', fr: 'Aperçu' },
	/** Name of the preview's region (`label`: the field's) */
	previewOf: {
		en: (label: string) => `${label} preview`,
		fr: (label: string) => `${label} : aperçu`
	},
	nothingToPreview: {
		en: 'Nothing to preview yet.',
		fr: "Rien à afficher pour l'instant."
	},
	markdownHint: {
		en: 'Markdown: ## headings, **bold**, _italic_, lists with “-”, [links](https://…).',
		fr: 'Markdown : ## titres, **gras**, _italique_, listes avec « - », [liens](https://…).'
	},
	/** '9,200 / 10,000 characters' (both already written as numbers of the language) */
	characters: {
		en: (count: string, max: string) => `${count} / ${max} characters`,
		fr: (count: string, max: string) => `${count} / ${max} caractères`
	}
});
