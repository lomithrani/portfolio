import { defineMessages } from '../i18n';

// Why a journey cannot be saved (parseWorkflow), as the owner's editor shows it at the step it is
// about. Step names are the manifests' labels, already in the language in use.
export const workflowMessages = defineMessages({
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
