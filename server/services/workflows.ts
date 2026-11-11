import { Types } from 'mongoose';
import {
  DEFAULT_WORKFLOW_STEPS,
  WORKFLOW_LIMITS,
  normalizeDomainName,
  openWorkflowSteps,
  parseWorkflow,
  stepManifest
} from 'portfolio-common';
import type { WorkflowStep, WorkflowStepInput, WorkflowStepStatus } from 'portfolio-common';
import { Domain, Workflow, WorkflowInstance } from '../models/database';
import {
  ConflictError,
  DomainDoesNotExistError,
  FieldValidationError,
  ForbiddenError,
  JourneyStepLockedError,
  MissingAuthCookieError
} from '../errors';
import { serverStep } from './workflowSteps';
import type { ServerStep, StepContext } from './workflowSteps';

// The hiring journey of a portfolio (plugins/workflows.ts): the steps its
// owner chose (Workflow), and what each step stored for each visitor
// (WorkflowInstance). This is the engine: it knows the order, the locks and
// the storage, and nothing about what a step is; each step type says where a
// visitor stands on it (services/workflowSteps/). A step is open once every
// step before it succeeded; the routes behind a step (the submit route, the
// booking routes of plugins/appointments.ts) check it here. The owner is
// never stopped by their own journey.

type Id = Types.ObjectId | string;

// ── DTOs ────────────────────────────────────────────────────

export interface JourneyStepDto {
  id: string;
  type: string;
  /** Where the caller stands on it (always pending for an anonymous visitor or the owner) */
  status: WorkflowStepStatus;
  /** The step's settings its type shows to visitors, when it shows any */
  config?: unknown;
  /** What the step's type tells the visitor about their own progress */
  view?: unknown;
}

/** GET /workflow/domains/:domainName: a portfolio's journey, as the caller stands in it */
export interface JourneyDto {
  /** The steps, in order */
  steps: JourneyStepDto[];
  /** The caller owns the portfolio: they preview their journey, which never stops them */
  own?: true;
}

// ── The owner's journey ─────────────────────────────────────

const isStepId = (stepId: string) => WORKFLOW_LIMITS.stepId.test(stepId);

/** What a step's type does; undefined for a type this version does not have (in either registry) */
const stepBehaviour = (type: string): ServerStep | undefined => (stepManifest(type) ? serverStep(type) : undefined);

const settings = (value: unknown): object =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};

/**
 * The owner's steps, in order; DEFAULT_WORKFLOW_STEPS until they choose. A
 * step whose type this version does not have (removed since it was saved) is
 * kept: it can never succeed, so the journey stops there instead of skipping
 * what its owner asked for
 */
export async function journeySteps(ownerId: Id): Promise<WorkflowStep[]> {
  const workflow = await Workflow.findOne({ user: ownerId }, { steps: 1 }).lean();
  if (!workflow) return DEFAULT_WORKFLOW_STEPS.map((step) => ({ ...step, config: { ...step.config } }));
  return (workflow.steps ?? []).map((step, index) => {
    const id = typeof step?.id === 'string' && isStepId(step.id) ? step.id : undefined;
    // Not a step as PUT /workflow stores them (written by hand, or by an older version): kept
    // under an id and a type nothing has, so it blocks the journey like a step of a removed type
    if (!id || typeof step.type !== 'string') return { id: `invalid-${index}`, type: '', config: {} };
    return { id, type: step.type, config: settings(step.config) };
  });
}


/**
 * Where a visitor's progress on a step is stored. The id becomes part of a
 * field path: only a real step id (no dot, no dollar) may
 */
const progressPath = (stepId: string) => {
  if (!isStepId(stepId)) throw new Error('Not a step id');
  return `steps.${stepId}`;
};

/**
 * Replaces the owner's steps with what parseWorkflow makes of `input` (422
 * naming `steps`, or the step and the setting the problem is about). An
 * upsert on the unique `user`: MongoDB retries it itself when two first
 * saves race, so the account keeps one journey.
 *
 * Progress is kept per step id: what visitors did on a step that is removed
 * (or whose id now names another type) is dropped, and so is anything stored
 * under the id of a step that enters the journey: a step added under an id
 * used before starts from nothing
 */
export async function saveJourneySteps(ownerId: string, input: readonly WorkflowStepInput[]): Promise<WorkflowStep[]> {
  const parsed = parseWorkflow(input);
  if (!parsed.ok) {
    const { message, stepId, field } = parsed.problem;
    const index = stepId === undefined ? -1 : input.findIndex((step) => step.id === stepId);
    const step = index === -1 ? 'steps' : `steps.${index}`;
    throw new FieldValidationError(index !== -1 && field ? `${step}.config.${field}` : step, message);
  }
  const { steps } = parsed;
  // The journey it replaces, read by the same operation: two saves in a row each see the one before
  const previous = await Workflow.findOneAndUpdate(
    { user: ownerId },
    { $set: { steps } },
    { upsert: true, runValidators: true, returnDocument: 'before', projection: { steps: 1 } }
  ).lean();
  // Dropped: the ids that left the journey or changed type, and the ids that enter it. The
  // second half is what makes "starts from nothing" hold whatever happened before: a submit
  // that raced an earlier save, or an earlier save whose own clean-up failed, can leave
  // progress under an id no journey has, which a step added under that id would inherit
  const before = new Map((previous?.steps ?? []).map((step) => [String(step?.id), String(step?.type)]));
  const after = new Map(steps.map((step) => [step.id, step.type]));
  const dropped = [...new Set([...before.keys(), ...after.keys()])]
    .filter((stepId) => before.get(stepId) !== after.get(stepId))
    .filter(isStepId);
  if (dropped.length > 0) {
    await WorkflowInstance.updateMany(
      { owner: ownerId },
      { $unset: Object.fromEntries(dropped.map((stepId) => [progressPath(stepId), ''])) }
    );
  }
  return steps;
}

/** The owner of the portfolio `domainName`; 404 when there is none */
export async function portfolioOwner(domainName: string): Promise<string> {
  const domain = await Domain.findOne({ name: normalizeDomainName(domainName) }, { admin: 1 }).lean();
  if (!domain) throw new DomainDoesNotExistError('Domain not found');
  return String(domain.admin);
}

// ── A caller in a journey ───────────────────────────────────

/** A session's user id the queries can use; anything else is an anonymous visitor */
const knownVisitor = (visitorId: string | undefined) =>
  visitorId && Types.ObjectId.isValid(visitorId) ? visitorId : undefined;

/** An owner's journey and the caller going through it */
interface Journey {
  ownerId: string;
  steps: WorkflowStep[];
  /** The caller owns the portfolio */
  own: boolean;
  /** The signed-in caller, when they are not the owner: the only callers who have progress */
  visitor?: string;
  /** What each step stored for the visitor, by step id */
  progress: Map<string, unknown>;
}

/** What the steps stored for `visitor` in the owner's journey, by step id */
async function visitorProgress(ownerId: string, visitor: string): Promise<Map<string, unknown>> {
  const instance = await WorkflowInstance.findOne({ owner: ownerId, visitor }, { steps: 1 }).lean();
  // A Map in the schema, a plain object once read with lean(): into a Map again, so a step id
  // is never looked up on an object's prototype
  return new Map(
    Object.entries(instance?.steps ?? {}).map(([stepId, entry]): [string, unknown] => [stepId, entry?.data])
  );
}

async function loadJourney(owner: Id, visitorId: string | undefined): Promise<Journey> {
  const ownerId = String(owner);
  const caller = knownVisitor(visitorId);
  const own = caller === ownerId;
  const visitor = own ? undefined : caller;
  const [steps, progress] = await Promise.all([
    journeySteps(ownerId),
    visitor ? visitorProgress(ownerId, visitor) : new Map<string, unknown>()
  ]);
  return { ownerId, steps, own, ...(visitor ? { visitor } : {}), progress };
}

const stepContext = (journey: Journey, visitor: string, step: WorkflowStep): StepContext<object, unknown> => ({
  ownerId: journey.ownerId,
  visitorId: visitor,
  config: step.config,
  data: journey.progress.get(step.id)
});

interface StepStanding {
  status: WorkflowStepStatus;
  view?: unknown;
}

/**
 * Where the journey's caller stands on each of `steps`. Only a visitor has
 * progress: an anonymous caller and the owner are pending everywhere, and no
 * step is asked
 */
async function standings(journey: Journey, steps: readonly WorkflowStep[]): Promise<StepStanding[]> {
  const { visitor } = journey;
  return Promise.all(
    steps.map(async (step): Promise<StepStanding> => {
      const behaviour = stepBehaviour(step.type);
      if (!visitor || !behaviour) return { status: 'pending' };
      const { status, view } = await behaviour.evaluate(stepContext(journey, visitor, step));
      return view === undefined ? { status } : { status, view };
    })
  );
}

/** The owner's journey as `visitorId` (undefined: not signed in) stands in it */
export async function journeyFor(ownerId: string, visitorId: string | undefined): Promise<JourneyDto> {
  const journey = await loadJourney(ownerId, visitorId);
  const standing = await standings(journey, journey.steps);
  return {
    steps: journey.steps.map((step, index) => {
      const config = stepBehaviour(step.type)?.visitorConfig?.(step.config);
      return { id: step.id, type: step.type, ...standing[index], ...(config === undefined ? {} : { config }) };
    }),
    ...(journey.own ? { own: true as const } : {})
  };
}

// ── Locks ───────────────────────────────────────────────────

export const SIGN_IN_TO_CONTINUE = 'Sign in to continue the hiring journey';
export const EARLIER_STEPS_FIRST = 'Complete the earlier steps of the hiring journey first';
export const JOURNEY_CHANGED = 'This hiring journey changed: reload the page';

/**
 * Where the caller stands on the steps before `index`, and which of the
 * steps up to `index` they can act on (portfolio-common's rule, the one the
 * page shows). The owner can act on all of them
 */
async function access(journey: Journey, index: number): Promise<{ before: StepStanding[]; open: boolean[] }> {
  const before = await standings(journey, journey.steps.slice(0, index));
  const open = openWorkflowSteps([...before.map((standing) => standing.status), 'pending']);
  return { before, open: journey.own ? open.map(() => true) : open };
}

/** Why a step that is not open is refused: 401 to a caller who could sign in, 403 to a visitor */
const lockedError = (journey: Journey) =>
  journey.visitor
    ? new JourneyStepLockedError(EARLIER_STEPS_FIRST)
    : new MissingAuthCookieError(SIGN_IN_TO_CONTINUE);

/** The position of the step `stepId`; 409 when the journey has none (it changed since the page loaded it) */
const stepIndex = (journey: Journey, stepId: string) => {
  const index = journey.steps.findIndex((step) => step.id === stepId);
  if (index === -1) throw new ConflictError(JOURNEY_CHANGED);
  return index;
};

/**
 * Lets `visitorId` (undefined: not signed in) use the step `stepId` of the
 * owner's journey, or throws: 409 when the journey has no such step, 401
 * when steps come before it and nobody is signed in, 403 when one of them
 * did not succeed. The owner always passes
 */
export async function assertStepOpen(ownerId: Id, visitorId: string | undefined, stepId: string): Promise<void> {
  const journey = await loadJourney(ownerId, visitorId);
  const index = stepIndex(journey, stepId);
  if (!(await access(journey, index)).open[index]) throw lockedError(journey);
}

/** A step the caller may use, and what the steps before it say for the meeting invitation */
export interface OpenStep {
  stepId: string;
  /**
   * What the visitor did on the steps before this one, in order, as lines
   * for the invitation (each step's `describe`). `webOrigin`: the web app
   * the request came from, when it is an allowed CORS origin
   */
  invitationLines(webOrigin?: string): Promise<string[]>;
}

/**
 * The step of type `type` of the owner's journey that `visitorId` can use,
 * for the routes behind a step type (the booking routes, for the meeting):
 * `missing()` when the journey has no step of that type, then checked like
 * assertStepOpen. With several steps of the type, the first open one
 */
export async function openStepOfType(
  ownerId: Id,
  visitorId: string | undefined,
  type: string,
  missing: () => Error
): Promise<OpenStep> {
  const journey = await loadJourney(ownerId, visitorId);
  const candidates = journey.steps.flatMap((step, index) => (step.type === type ? [index] : []));
  const last = candidates.at(-1);
  if (last === undefined) throw missing();
  const { before, open } = await access(journey, last);
  const index = candidates.find((candidate) => open[candidate]);
  if (index === undefined) throw lockedError(journey);
  return {
    stepId: journey.steps[index].id,
    invitationLines: async (webOrigin) => {
      const { visitor } = journey;
      const lines: string[] = [];
      if (!visitor) return lines;
      for (const [position, step] of journey.steps.slice(0, index).entries()) {
        const describe = stepBehaviour(step.type)?.describe;
        if (!describe || before[position].status !== 'succeeded') continue;
        lines.push(...(await describe({ ...stepContext(journey, visitor, step), ...(webOrigin ? { webOrigin } : {}) })));
      }
      return lines;
    }
  };
}

// ── What a step stores ──────────────────────────────────────

export const OWN_JOURNEY = 'You cannot go through your own hiring journey';
export const STEP_NOT_SUBMITTABLE = 'Nothing can be submitted on this step';

/**
 * A visitor submits `input` on the step `stepId` of the portfolio
 * `domainName` (again: the latest counts). Not on one's own portfolio (403);
 * the step must be open to them, and its type must take submissions (409).
 * The type checks `input` and says what to store. Returns the journey as
 * the visitor now stands in it
 */
export async function submitStep(
  domainName: string,
  visitorId: string,
  stepId: string,
  input: unknown
): Promise<JourneyDto> {
  const ownerId = await portfolioOwner(domainName);
  if (ownerId === visitorId) throw new ForbiddenError(OWN_JOURNEY);
  const journey = await loadJourney(ownerId, visitorId);
  const index = stepIndex(journey, stepId);
  const { visitor } = journey;
  if (!visitor || !(await access(journey, index)).open[index]) throw lockedError(journey);
  const step = journey.steps[index];
  const submit = stepBehaviour(step.type)?.submit;
  if (!submit) throw new ConflictError(STEP_NOT_SUBMITTABLE);
  const data = await submit({ ...stepContext(journey, visitor, step), input });
  // Unique (owner, visitor): MongoDB retries the upsert itself when two first submits race
  await WorkflowInstance.updateOne(
    { owner: ownerId, visitor },
    { $set: { [progressPath(step.id)]: { data, updatedAt: new Date() } } },
    { upsert: true }
  );
  return journeyFor(ownerId, visitor);
}

/**
 * Stores what a step recorded outside the submit route (the meeting step: a
 * booking), for a signed-in visitor who is already going through the owner's
 * journey (who completed a step before it). Nothing for anyone else: an open
 * booking page keeps no trace of its visitors
 */
export async function recordStepData(
  ownerId: Id,
  visitorId: string | undefined,
  stepId: string,
  data: unknown
): Promise<void> {
  const visitor = knownVisitor(visitorId);
  if (!visitor || visitor === String(ownerId)) return;
  await WorkflowInstance.updateOne(
    { owner: ownerId, visitor },
    { $set: { [progressPath(stepId)]: { data, updatedAt: new Date() } } }
  );
}
