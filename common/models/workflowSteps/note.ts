import type { StepConfigResult, WorkflowStepManifest } from '../workflow';

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
	if (!title) return { ok: false, field: 'title', message: 'Give the note a title.' };
	if (title.length > NOTE_STEP_LIMITS.title) {
		return {
			ok: false,
			field: 'title',
			message: `The title is at most ${NOTE_STEP_LIMITS.title} characters.`
		};
	}
	if (!body) return { ok: false, field: 'text', message: 'Write the note recruiters will read.' };
	if (body.length > NOTE_STEP_LIMITS.text) {
		return {
			ok: false,
			field: 'text',
			message: `The note is at most ${NOTE_STEP_LIMITS.text} characters.`
		};
	}
	return { ok: true, config: { title, text: body } };
};

export const noteStep: WorkflowStepManifest<NoteStepConfig> = {
	type: 'note',
	kind: 'requirement',
	label: 'Read a note',
	description:
		'Recruiters read a note you wrote (what you are looking for, your conditions) and confirm it before going further.',
	defaultConfig: () => ({ title: '', text: '' }),
	parseConfig
};
