import { Schema, model } from "mongoose";
import type { InferSchemaType, Types } from "mongoose";
import { WORKFLOW_STEP_TYPES } from "portfolio-common";

// The hiring journey of an account (the owner of a portfolio): the steps
// visitors go through on its Hire page, in order (portfolio-common
// WORKFLOW_STEP_TYPES, each at most once, checked by workflowStepsProblem).
// One per account (unique index); an account without one has portfolio-common's
// DEFAULT_WORKFLOW_STEPS. Written by PUT /workflow only.
//
// Its own collection: `workflows` holds the documents of the earlier
// /workflows API (name, enabled, description, never any step), which nothing
// reads anymore.
const workflowStepSchema = new Schema({
  // A field named `type`: declared as an object, so Mongoose does not take it for the path's type
  type: { type: String, enum: WORKFLOW_STEP_TYPES, required: true }
}, { _id: false });

export const workflowSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  steps: { type: [workflowStepSchema], default: [] }
}, { timestamps: true, collection: 'hiringworkflows' });

export type Workflow = InferSchemaType<typeof workflowSchema> & { _id: Types.ObjectId };
export const Workflow = model('Workflow', workflowSchema);
