import type { ServerStep } from './types';
import { storedDate } from './types';

// Meeting step: the visitor books a slot in the owner's calendar. Nothing to
// submit here: the booking routes (plugins/appointments.ts) check that the
// step is open, and record the booking on it once Google took it.

export interface MeetingStepData {
  /** The last booking made through the journey */
  bookedAt: Date;
}

export const meetingStep: ServerStep<Record<string, never>, MeetingStepData> = {
  type: 'meeting',
  evaluate: async ({ data }) => ({ status: storedDate(data?.bookedAt) ? 'succeeded' : 'pending' })
};
