import { createContext } from 'svelte';
import type { FieldKey } from '#services/experienceForm.ts';

/** What the editor's fields share: element ids and the error shown for each field */
export type EditorContext = {
	/** Id of the control a field's label and error link point to */
	fieldId: (field: FieldKey) => string;
	/** Id of the element holding the field's error message */
	errorId: (field: FieldKey) => string;
	/** The error currently shown for the field (reactive) */
	error: (field: FieldKey) => string | undefined;
};

export const [getEditorContext, setEditorContext] = createContext<EditorContext>();
