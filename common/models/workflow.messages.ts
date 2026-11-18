import { defineMessages } from '../i18n';

// Why a journey cannot be saved (parseWorkflow), as the owner's editor shows it at the step it is
// about. Step names are the manifests' labels, already in the language in use. And the note the
// gate template starts with (journeyTemplate), in the owner's words: once saved it is their text,
// shown as they wrote it (Markdown) in whatever language the recruiter reads the page.
export const workflowMessages = defineMessages({
	/**
	 * The note of the gate template: it asks for the job with its pay range first, says the job is
	 * scored against what the owner looks for, and that a meeting can be booked once it matches.
	 * Within NOTE_STEP_LIMITS (client/src/services/tests/workflow.test.ts)
	 */
	gateNote: {
		title: { en: 'Share the job first', fr: "Présentez d'abord le poste" },
		text: {
			en: 'Thank you for your interest. Before we talk, please share the job on this page: pick one of your job descriptions or write a new one, with its pay range.\n\nThe job is then scored against what I look for. If it is a match, you can book a meeting in my calendar right away. This saves us both a call about a job that would not fit.',
			fr: "Merci de votre intérêt. Avant d'échanger, présentez le poste sur cette page : choisissez l'une de vos offres d'emploi ou rédigez-en une nouvelle, avec sa fourchette de rémunération.\n\nL'offre est ensuite notée par rapport à ce que je recherche. Si elle correspond, vous pouvez réserver tout de suite un rendez-vous dans mon agenda. Cela nous évite à tous les deux un appel pour un poste qui ne conviendrait pas."
		}
	},
	tooManySteps: {
		en: (max: number) => `A journey has at most ${max} steps.`,
		fr: (max: number) => `Un parcours compte ${max} étapes au maximum.`
	},
	invalidStepId: {
		en: 'A step has an invalid id.',
		fr: 'Une étape a un identifiant non valide.'
	},
	duplicateStepId: {
		en: 'Two steps have the same id.',
		fr: 'Deux étapes ont le même identifiant.'
	},
	unknownStepType: {
		en: 'This step is not available anymore: remove it.',
		fr: "Cette étape n'est plus disponible : retirez-la."
	},
	usedOnce: {
		en: (step: string) => `“${step}” can be used only once.`,
		fr: (step: string) => `L'étape « ${step} » ne peut être utilisée qu'une fois.`
	},
	usedTooOften: {
		en: (step: string, max: number) => `“${step}” can be used at most ${max} times.`,
		fr: (step: string, max: number) =>
			`L'étape « ${step} » peut être utilisée ${max} fois au maximum.`
	},
	settingsNotAnObject: {
		en: 'The settings of a step must be an object.',
		fr: "Les réglages d'une étape doivent être un objet."
	},
	/** `step` needs `needed` before it, and the journey has it further down */
	neededStepBelow: {
		en: (step: string, needed: string) =>
			`“${step}” works on what recruiters did in “${needed}”: move it below that step.`,
		fr: (step: string, needed: string) =>
			`L'étape « ${step} » s'appuie sur ce que les recruteurs ont fait dans « ${needed} » : placez-la après cette étape.`
	},
	/** `step` needs `needed` before it, and the journey does not have it */
	neededStepMissing: {
		en: (step: string, needed: string) =>
			`“${step}” works on what recruiters did in “${needed}”: add that step before it.`,
		fr: (step: string, needed: string) =>
			`L'étape « ${step} » s'appuie sur ce que les recruteurs ont fait dans « ${needed} » : ajoutez cette étape avant elle.`
	},
	/** A requirement step under the last step it could open (`above`) */
	opensNothingMove: {
		en: (step: string, above: string) =>
			`“${step}” must come before a step it opens: move it above “${above}”.`,
		fr: (step: string, above: string) =>
			`L'étape « ${step} » doit précéder une étape qu'elle ouvre : placez-la avant « ${above} ».`
	},
	/** A requirement step in a journey without any step it could open: `access` names those to add */
	opensNothingAdd: {
		en: (step: string, access: readonly string[]) =>
			`“${step}” must come before a step it opens: add ${access.map((name) => `“${name}”`).join(' or ')} after it.`,
		fr: (step: string, access: readonly string[]) =>
			`L'étape « ${step} » doit précéder une étape qu'elle ouvre : ajoutez ${access.map((name) => `« ${name} »`).join(' ou ')} après elle.`
	}
});
