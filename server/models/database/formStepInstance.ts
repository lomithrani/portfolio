import { Schema, Types, model } from 'mongoose';
import type { Document } from 'mongoose';
import { FormStep } from './formStep';

export interface FormResponse {
  inputName: string;
  value: unknown;
}

export interface FormStepInstance extends Document {
  formStep: Types.ObjectId | FormStep;
  responses: FormResponse[];
  submittedAt: Date;
}

const formResponseSchema = new Schema<FormResponse>({
  inputName: { type: String, required: true },
  value: { type: Schema.Types.Mixed, required: true },
});

const formStepInstanceSchema = new Schema<FormStepInstance>({
  formStep: { type: Schema.Types.ObjectId, ref: 'FormStep', required: true },
  responses: [formResponseSchema],
  submittedAt: { type: Date, default: Date.now },
});

export const FormStepInstance = model<FormStepInstance>('FormStepInstance', formStepInstanceSchema);
