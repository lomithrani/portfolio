import { Schema } from 'mongoose';
import { WorkflowStep } from './workflowStep';

enum MeetingType {
  Visio,
  Vocal,
  InPerson
}

export interface MeetingStep extends WorkflowStep {
  available: { start: Date; end: Date }[];
  meetingLength: number;
  type: MeetingType;
}

const meetingStepSchema = new Schema<MeetingStep>({
  available: [
    {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
    },
  ],
  meetingLength: { type: Number, required: true },
  // Numeric enum: Object.values() would also list the reverse-mapped names
  type: {
    type: Number,
    required: true,
    enum: [MeetingType.Visio, MeetingType.Vocal, MeetingType.InPerson],
    default: MeetingType.Visio
  },
});

export const MeetingStep = WorkflowStep.discriminator<MeetingStep>('MeetingStep', meetingStepSchema);
