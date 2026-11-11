import { Schema, model } from "mongoose";
import type { InferSchemaType, Types } from "mongoose";

// The hiring journey of an account (the owner of a portfolio): the steps
// visitors go through on its Hire page, in order. Each step has an id of its
// own (a visitor's progress is kept under it, see WorkflowInstance), a type
// and that type's settings, as portfolio-common's parseWorkflow returned
// them. One per account (unique index); an account without one has
// portfolio-common's DEFAULT_WORKFLOW_STEPS. Written by PUT /workflow only.
//
// No enum on `type`: the step types are the registry of portfolio-common,
// which validates what is saved. A step whose type was removed since stays
// stored, and blocks the journey until its owner removes it
// (services/workflows.ts).
//
// Its own collection: `workflows` holds the documents of the earlier
// /workflows API (name, enabled, description, never any step), which nothing
// reads anymore.
const workflowStepSchema = new Schema({
  id: { type: String, required: true },
  // A field named `type`: declared as an object, so Mongoose does not take it for the path's type
  type: { type: String, required: true },
  /** The type's settings, normalised by its manifest's parseConfig */
  config: { type: Schema.Types.Mixed, default: {} }
  // minimize: a step without settings keeps its `config: {}`
}, { _id: false, minimize: false });

export const workflowSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  steps: { type: [workflowStepSchema], default: [] }
}, { timestamps: true, collection: 'hiringworkflows', minimize: false });

export type Workflow = InferSchemaType<typeof workflowSchema> & { _id: Types.ObjectId };
export const Workflow = model('Workflow', workflowSchema);
