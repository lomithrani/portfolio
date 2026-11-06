import { createContext } from 'svelte';
import type { JobFormField } from '#services/jobPosting.ts';

/** What the job editor's fields share: element ids and the error shown for each field */
export type JobEditorContext = {
	/** Id of the control a field's label and the error summary's link point to */
	fieldId: (field: JobFormField) => string;
	/** Id of the element holding the field's error message */
	errorId: (field: JobFormField) => string;
	/** The error currently shown for the field (reactive) */
	error: (field: JobFormField) => string | undefined;
};

export const [getJobEditorContext, setJobEditorContext] = createContext<JobEditorContext>();

/** What a field gives its control (Field.svelte): spread on the input or select */
export type ControlAttributes = {
	id: string;
	'aria-invalid': true | undefined;
	'aria-describedby': string | undefined;
	'aria-required': true | undefined;
};
