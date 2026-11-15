import type { StepConfigResult, WorkflowStepManifest } from '../workflow';
import { workflowStepMessages as m } from './workflowSteps.messages';

/** A note of the owner's that the visitor reads and confirms before going further */
export interface NoteStepConfig {
	/** What the step is called on the Hire page, e.g. "Before you book" */
	title: string;
	/** Markdown, shown without raw HTML */
	text: string;
}

export const NOTE_STEP_LIMITS = { title: 80, text: 2000 } as const;

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const parseConfig = (raw: unknown): StepConfigResult<NoteStepConfig> => {
	const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const title = text(source.title);
	const body = text(source.text);
	if (!title) return { ok: false, field: 'title', message: m.note.titleRequired };
	if (title.length > NOTE_STEP_LIMITS.title) {
		return {
			ok: false,
			field: 'title',
			message: m.note.titleTooLong(NOTE_STEP_LIMITS.title)
		};
	}
	if (!body) return { ok: false, field: 'text', message: m.note.textRequired };
	if (body.length > NOTE_STEP_LIMITS.text) {
		return {
			ok: false,
			field: 'text',
			message: m.note.textTooLong(NOTE_STEP_LIMITS.text)
		};
	}
	return { ok: true, config: { title, text: body } };
};

export const noteStep: WorkflowStepManifest<NoteStepConfig> = {
	type: 'note',
	kind: 'requirement',
	get label() {
		return m.note.label;
	},
	get description() {
		return m.note.description;
	},
	defaultConfig: () => ({ title: '', text: '' }),
	parseConfig
};
