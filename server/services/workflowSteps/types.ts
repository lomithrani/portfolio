import type { WorkflowStepStatus } from 'portfolio-common';
import type { MutualInterest } from '../mutualInterests';

// What a step type of the hiring journey does in the API. One file per type
// in this folder, registered in index.ts under the name of its manifest in
// portfolio-common (docs/WORKFLOW_STEPS.md, "Adding a step"). The engine
// (services/workflows.ts) owns the order, the locks and the storage; a step
// only says where a visitor stands on it and what they may submit.
//
// `config` is what the owner saved for the step (through its manifest's
// parseConfig) and `data` what the step stored for this visitor. Both come
// back from the database as they were written, possibly by an older version
// of the step: read them defensively.

/** A step that comes before another in the journey, with what it stored for the visitor */
export interface EarlierStep {
  id: string;
  type: string;
  /** As that step's type wrote it: read it with that type's own helpers */
  data: unknown;
}

export interface StepContext<Config, Data> {
  ownerId: string;
  visitorId: string;
  config: Config;
  /** What this step stored for this visitor; undefined when nothing yet */
  data: Data | undefined;
  /**
   * The steps before this one, in order: for a type that works on what the
   * visitor did earlier (its manifest's `needs`: the job match scores the job
   * picked in the job step)
   */
  earlier: readonly EarlierStep[];
  /**
   * The steps after this one, in order: their ids and types only (what they stored is theirs). For
   * a type whose submission matters to a step after it (the job step caps the shares a job match
   * after it scores)
   */
  later: readonly { id: string; type: string }[];
  /**
   * The mutual interest of matching (Path 2) between the owner and this visitor that leads into the
   * journey now, when there is one (services/mutualInterests.ts; none while MATCHING is off): the
   * job step holds its job, the job match its score as it was then. The engine reads it once per
   * journey, like the progress
   */
  mutualInterest?: MutualInterest;
}

export interface ServerStep<Config extends object = object, Data = unknown, View = unknown> {
  /** Same name as its manifest in portfolio-common */
  type: string;
  /**
   * Where the visitor stands, from what the step stored and what it reads
   * now. `view`: what the visitor's page gets about it (never anything private)
   */
  evaluate(ctx: StepContext<Config, Data>): Promise<{ status: WorkflowStepStatus; view?: View }>;
  /** The step's settings as visitors may see them; nothing when unset (settings are private by default) */
  visitorConfig?(config: Config): unknown;
  /**
   * What the visitor submits on the step (POST .../steps/:stepId): checks
   * `input`, returns the data to store (replacing the previous one). Steps
   * without it cannot be submitted (409)
   */
  submit?(ctx: StepContext<Config, Data> & { input: unknown }): Promise<Data>;
  /**
   * Lines for the meeting invitation about what the visitor did on this step
   * (only asked for steps that succeeded and come before the meeting).
   * `webOrigin`: the web app the request came from, when it is an allowed
   * CORS origin
   */
  describe?(ctx: StepContext<Config, Data> & { webOrigin?: string }): Promise<string[]> | string[];
}

/** `input` as an object whose fields a step can read; undefined for anything else */
export const inputFields = (input: unknown): Record<string, unknown> | undefined =>
  input !== null && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : undefined;

/** A date a step stored, when it still is one */
export const storedDate = (value: unknown): Date | undefined =>
  value instanceof Date && !Number.isNaN(value.getTime()) ? value : undefined;
