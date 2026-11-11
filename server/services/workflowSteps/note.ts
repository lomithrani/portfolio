import type { NoteStepConfig } from 'portfolio-common';
import { FieldValidationError } from '../../errors';
import type { ServerStep } from './types';
import { inputFields, storedDate } from './types';

// Note step: the owner wrote a note, the visitor reads it and confirms.

export interface NoteStepData {
  acknowledgedAt: Date;
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

export const noteStep: ServerStep<NoteStepConfig, NoteStepData> = {
  type: 'note',
  evaluate: async ({ data }) => ({ status: storedDate(data?.acknowledgedAt) ? 'succeeded' : 'pending' }),
  // The note is written for visitors: its whole settings are theirs to read
  visitorConfig: (config) => ({ title: text(config.title), text: text(config.text) }),
  submit: async ({ input }) => {
    if (inputFields(input)?.acknowledged !== true) {
      throw new FieldValidationError('input.acknowledged', 'Confirm that you have read the note');
    }
    return { acknowledgedAt: new Date() };
  }
};
