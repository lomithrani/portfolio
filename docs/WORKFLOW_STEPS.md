# Hiring journey steps

The Hire page of a portfolio (`/<domain>/hire`) is its **hiring journey**: the steps a visitor (a
recruiter) goes through, in the order the portfolio's owner chose. This document explains how a
journey is built and how to add a new kind of step to it. It uses the `note` step (the owner writes
a note, the visitor reads it and confirms) as the worked example, because it is the smallest step
that has settings, something to submit and something to show.

Steps people ask for arrive as GitHub issues titled "Step suggestion: ..." and labelled
`enhancement`: portfolio owners send them from their step editor ("Missing a step? Suggest a
step", when the server has a `GITHUB_ISSUES_TOKEN`; see "Step suggestions" in
`docs/DEPLOYMENT.md`). Their text is shown as plain text in a code block, and the issue does not
say who sent it.

## How a journey works

A journey is an ordered list of **steps**. Each step has three fields:

- `id`: unique in the journey (`note`, `note-2`, `job`...). A visitor's progress is stored under it.
- `type`: the name of a **step type** (`note`, `job`, `meeting`).
- `config`: the settings of that step, whose shape belongs to its type (`{}` for a type without
  settings).

Three people meet in a journey. The **owner** of the portfolio chooses the steps in the admin tab
"Hiring journey". A **visitor** is anyone else who is signed in; they have progress. An
**anonymous** caller is not signed in: they see the steps, and have no progress.

A visitor stands on each step with a **status**: `pending` (not done yet, or to do again),
`succeeded`, or `failed`. No step produces `failed` yet (see [What comes next](#what-comes-next)).
The one rule of the runtime is: **a step is open when every step before it has the status
`succeeded`** (`openWorkflowSteps` in `common/models/workflow.ts`). The first step is therefore
open to anyone, signed in or not. The owner previews their own journey and is never stopped by it.

A portfolio whose owner never chose anything has `DEFAULT_WORKFLOW_STEPS`: one `meeting` step, so
the Hire page is a booking page open to anyone.

The engine (`server/services/workflows.ts`) owns the order, the locks and the storage. It knows
nothing about what a step is. A step type only answers two questions: where does this visitor
stand on me, and what may they submit?

### Where things are stored

| Model (`server/models/database/`) | What it holds |
| --- | --- |
| `Workflow` (`workflow.ts`, collection `hiringworkflows`, one per owner) | `steps: [{ id, type, config }]`, as `parseWorkflow` returned them. Written by `PUT /workflow` only. |
| `WorkflowInstance` (`workflowInstance.ts`, one per `(owner, visitor)`) | `steps`: a map from step id to `{ data, updatedAt }`, what each step stored for this visitor. Created by the visitor's first submit. |

Because progress is kept per step id, reordering a journey keeps it. Progress on a step is dropped
when the owner saves a journey that no longer has that id, or where that id now names another type
(`saveJourneySteps`); anything left under the id of a step that enters the journey is dropped too,
so a step added under an id used before always starts from nothing. It is **not** dropped when the
owner only changes the step's settings: a visitor who confirmed a note keeps their confirmation
when the note is reworded.

A stored step that is not one (no valid id, no type: written by hand, never by `PUT /workflow`) is
kept under an id and a type nothing has, so it blocks the journey like a step of a removed type
until the owner saves the journey again.

### The routes

All in `server/plugins/workflows.ts`, the same for every step type:

| Route | Who | What |
| --- | --- | --- |
| `GET /workflow` | owner (session) | Their steps, with their full settings: `{ steps: [{ id, type, config }] }`. |
| `PUT /workflow` | owner (session) | Replaces their steps. Answers the steps as stored (settings normalised). |
| `GET /workflow/domains/:domainName` | anyone | The journey as the caller stands in it: `{ steps: [{ id, type, status, config?, view? }], own? }`. |
| `POST /workflow/domains/:domainName/steps/:stepId` | visitor (session) | Submits `{ input }` on a step. Answers the journey as the visitor now stands in it. |

The booking routes of `server/plugins/appointments.ts` (`available-dates`, `available-slots`,
`book`) are behind the `meeting` step: see
[Steps with routes of their own](#steps-with-routes-of-their-own).

## The three parts of a step type

A step type is defined in three places, one per workspace, under the same `type` name:

| Part | Where | What it says |
| --- | --- | --- |
| Manifest | `common/models/workflowSteps/<type>.ts`, registered in `common/models/workflowSteps/index.ts` | The type's name, kind, label, description, how many a journey can have, its default settings and the rules of its settings. Shared by the API (which enforces the rules) and the owner's editor (which shows them). |
| Server step | `server/services/workflowSteps/<type>.ts`, registered in `server/services/workflowSteps/index.ts` | Where a visitor stands on the step, what they can submit, which settings visitors may read. |
| Client entry | `client/src/lib/components/hire/steps/`, registered in `index.ts` there | What the visitor sees on the Hire page, and the settings form of the owner's editor. |

The three registries must agree:

- `server/tests/workflows.test.ts` ("the step types") fails when the API's registry and the
  manifests differ.
- A stored step whose type has no manifest or no server step is **kept** in the journey and can
  never succeed (`stepBehaviour` in `server/services/workflows.ts`). The journey stops there: it
  never skips a step its owner asked for.
- A step whose type has no client entry is shown as "This step is not available." on the Hire page.

## config, data, view, input: what they are and who sees them

These four words come back in every part of a step. Keep them apart.

| | What it is | Who writes it | Where it lives | Who can read it |
| --- | --- | --- | --- | --- |
| `config` | The settings of one step. | The owner, through `PUT /workflow`. Only what the manifest's `parseConfig` returns is stored. | `Workflow.steps[].config` | The owner gets all of it (`GET /workflow`). Everyone else gets only what the server step's `visitorConfig` returns, and nothing when the type has no `visitorConfig`. |
| `data` | What the step stored for one visitor (when they confirmed, which job they picked). | The server step: the return value of `submit`, or `recordStepData` for a step with routes of its own. | `WorkflowInstance.steps.<stepId>.data` | No route returns it. The step reads it back in `evaluate`, `submit` and `describe`. |
| `view` | What the visitor's page is told about their own progress on the step. | The server step's `evaluate`, computed at each read. | Not stored. | The signed-in visitor it is about, and nobody else. |
| `input` | What the visitor's browser sent on a submit. | The visitor. | Not stored. | The server step's `submit`, which must check it. |

Two consequences that are easy to miss:

- **What `visitorConfig` returns is public.** `GET /workflow/domains/:domainName` needs no session,
  so anonymous callers get it too. Return a setting there only when it is written for visitors.
- **The owner does not see a visitor's `data`.** The only thing that reaches the owner is what the
  step's `describe` puts in the meeting invitation.

## Adding a step: the note step, file by file

### 1. The manifest: `common/models/workflowSteps/note.ts`

The manifest is a `WorkflowStepManifest<Config>` (declared in `common/models/workflow.ts`):

| Field | Meaning |
| --- | --- |
| `type` | The type's unique name. It must match `WORKFLOW_LIMITS.stepType`: a lowercase letter, then lowercase letters, digits and hyphens, 40 characters at most. |
| `kind` | `requirement`: something the visitor does, which gives nothing by itself and only opens the steps after it (read a note, pick a job). `access`: what the journey leads to (book a meeting). A journey cannot be saved with a requirement step that has no access step after it, since it would open nothing. |
| `label` | The step's name, for the owner and the visitor ("Read a note"). |
| `description` | What the step asks of visitors, written for the owner who is choosing steps. |
| `max` | How many steps of this type a journey can have. Leave it unset for any number (the note), set `1` when a second one would make no sense (the job, the meeting). |
| `defaultConfig()` | The settings a new step starts with. They may be incomplete: the note starts with an empty title and text, which the owner fills in before they can save. |
| `parseConfig(raw)` | Checks and normalises the settings. `raw` is whatever the client sent: treat it as `unknown`. Return `{ ok: true, config }` with **only the keys you know** (the rest is dropped), or `{ ok: false, message, field }` where `field` names the setting the message is about. |

The note's settings are a title and a Markdown text, with their limits exported so the settings
form can use the same numbers:

```ts
export interface NoteStepConfig {
	/** What the step is called on the Hire page, e.g. "Before you book" */
	title: string;
	/** Markdown, shown without raw HTML */
	text: string;
}

export const NOTE_STEP_LIMITS = { title: 80, text: 2000 } as const;

export const noteStep: WorkflowStepManifest<NoteStepConfig> = {
	type: 'note',
	kind: 'requirement',
	label: 'Read a note',
	description:
		'Recruiters read a note you wrote (what you are looking for, your conditions) and confirm it before going further.',
	defaultConfig: () => ({ title: '', text: '' }),
	parseConfig
};
```

Its `parseConfig` trims both fields, refuses an empty or too long title (`field: 'title'`) and an
empty or too long text (`field: 'text'`), and returns `{ title, text }`.

Then register the manifest in `common/models/workflowSteps/index.ts`, in the `manifests` array.
The order of that array is the order in which the owner's editor offers the types. Export from
`common/models/index.ts` what the client or the server needs by name (for the note:
`NOTE_STEP_LIMITS` and the type `NoteStepConfig`).

`parseConfig` runs in two places with the same result: in the owner's editor on every change, and
in the API on `PUT /workflow` (`parseWorkflow`, called by `saveJourneySteps`). When it refuses, the
API answers 422 and names the step (by its position in the request) and the setting:

```json
{ "type": "validation", "on": "body", "property": "steps.1.config.title", "message": "Give the note a title." }
```

The editor shows the message at that field, which is why `field` must be the key of the setting in
`config`.

### 2. The server step: `server/services/workflowSteps/note.ts`

A server step is a `ServerStep<Config, Data, View>` (declared in
`server/services/workflowSteps/types.ts`). Every function receives a context: `ownerId`,
`visitorId`, the step's `config`, and `data`, what this step stored for this visitor (`undefined`
when nothing yet).

| Function | Required | What it does |
| --- | --- | --- |
| `evaluate(ctx)` | yes | Returns `{ status, view? }`: where the visitor stands, from what the step stored and from what it reads now. |
| `visitorConfig(config)` | no | Returns the settings visitors may read. Without it, visitors get none of the step's settings. |
| `submit(ctx & { input })` | no | Checks `input` and returns the `data` to store, which replaces the previous one. Without it, a submit on the step is refused with 409. |
| `describe(ctx & { webOrigin? })` | no | Returns lines for the meeting invitation about what the visitor did on this step. |

The whole note step:

```ts
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
```

Then register it in `server/services/workflowSteps/index.ts`, in the `steps` array, and export its
data type from there.

What to know about each function:

**`evaluate`** decides the status every time the journey is read. Nothing stores a status. It is
called for every step each time a signed-in visitor loads the journey, and for the steps before a
step each time that step is used (each submit, each availability request of the booking calendar),
so keep it cheap: no query for the note, one indexed query for the job. It is never called for the
owner or for an anonymous caller, who are `pending` on every step. A step may read more than its
own data: the job step loads the posting again and is `succeeded` only while that posting still
belongs to the visitor and is open, so a posting closed since sends the visitor back to the step.

**`view`** is the part of `evaluate`'s answer the visitor's page receives. The note has none. The
job step returns `{ job: { _id, title, company?, status } }`, the posting the visitor picked, so
the page can show it. Put there only what this visitor may know.

**`submit`** is reached through `POST /workflow/domains/:domainName/steps/:stepId` with a JSON body
`{ input }`. Before it is called, the engine (`submitStep`) has checked that the portfolio exists
(404), that the caller is not its owner (403), that the journey has this step (409 "This hiring
journey changed: reload the page") and that the step is open to the visitor (403). `input` is
`unknown`: use `inputFields(input)` (in `types.ts`) to read it as an object, check each field, and
throw a `FieldValidationError('input.<field>', message)` for a 422 that names the field. Other
refusals use the error classes of `server/errors.ts` (the job step answers 404 for a posting that
is not the visitor's and 409 for one that is not open). A visitor can submit again: the latest
`data` replaces the previous one.

**`data`** is stored as returned, in a `Mixed` field. It comes back as it was written, possibly by
an older version of the step: read it defensively. `storedDate(value)` (in `types.ts`) returns a
date only when the stored value still is one.

**`config`** deserves the same care. It was normalised by `parseConfig` when the owner saved, and is
not parsed again when it is read: after you change a type's settings, journeys saved before still
hold the old shape until their owner saves again. This is why the note's `visitorConfig` checks
that each field is a string instead of returning `config` as it is.

**`describe`** is asked only for steps that succeeded and come before the meeting step, when the
visitor books. Its lines go into the calendar event's description, between the "Booked via
portfolio by ..." line and the visitor's notes, so both the owner and the visitor read them. The
job step returns `Job: <title> — <company>` and, when the request came from an allowed web origin,
the public link of the posting. The note describes nothing.

### 3. The client entry: `client/src/lib/components/hire/steps/`

The registry `client/src/lib/components/hire/steps/index.ts` maps a type name to an entry:

| Field | Required | What it is |
| --- | --- | --- |
| `Visitor` | yes | The Svelte component the Hire page mounts for the step. |
| `Settings` | no | The component of the step's settings form in the owner's editor. Leave it out for a type without settings. |
| `note(step, state)` | yes | The line under the step's name: what it asks, or what the visitor did there. |
| `title(step)` | no | The step's name when it is not the manifest's label. The note returns its `config.title`. |
| `wantsOpen(step, address)` | no | Whether the address asks for this step to be shown unfolded. The job step uses it when the address carries a `?job=` other than the job picked. |
| `reopenLabel` | no | What the button that unfolds the step says once it is done ("Change" for the job step); "Open" when unset. |
| `ownerPreview` | no | Set it to `true` when the owner's preview should show the step itself (the note, without its button) instead of the manifest's description. The `Visitor` then gets `journey.own` and must offer the owner nothing to submit: the API refuses the owner on their own journey. |
| `goal` | for an `access` type | How the Hire page presents itself when the journey leads to this step: `heading(ownerName)` (the page's title), `alone` (the line under it when the step is the whole journey) and `after` (the same line when steps come before it). `registry.test.ts` fails when an `access` type has none. |

The entry's type is `ClientStep` in `types.ts` of that folder, with the props below. Today's
components there are `NoteStep.svelte`, `NoteSettings.svelte`, `JobStep.svelte` and
`MeetingStep.svelte` (a thin wrapper around `hire/MeetingBooking.svelte`).

The `Visitor` component receives these props:

| Prop | What it is |
| --- | --- |
| `step` | `{ id, type, status, config?, view? }`, as `GET /workflow/domains/:domainName` returned it. |
| `journey`, `domainName`, `ownerName` | The whole journey, the portfolio's name and its owner's name. |
| `address` | The address last navigated to. Read query parameters from it, not from `page.url`, which is out of date after a shallow navigation. |
| `submit(input)` | Sends `{ input }` to `POST .../steps/:stepId`. Resolves to `{ ok: true }`, or `{ ok: false, status, value }` with the API's answer. On success the page shows the journey the API returned and moves on to the next step. Turn a failure into a message with `submitFailure(status, value)` of `client/src/services/workflow.ts`: it recognises the journey's own refusals (session ended, step locked, journey changed) and shows anything your step's `submit` refused as the API worded it, so write those messages for the visitor. |
| `reload()` | Loads the journey again, when it may be out of date (the owner changed it, the session ended). |
| `locked(reason)` | Tells the page that the API refused a request of this step with 401 (`'signed-out'`) or 403 (`'locked'`). |
| `succeeded()` | Tells the page that the step succeeded without a submit (the meeting was booked). |

The `Settings` component receives `config` (the step's current settings), `onChange(config)` (call
it with the whole new settings on each edit), `problem` (`{ field?, message }` when `parseWorkflow`
or the API refused this step's settings), `disabled` (the editor is saving) and `idPrefix` (to build
ids unique to this step, since a journey can have two notes).

For the note:

- `Visitor` shows `step.config.text` with `Markdown.svelte` and `html={false}` (the owner's
  Markdown is never rendered as raw HTML), then a button "I have read this" that calls
  `submit({ acknowledged: true })`. Once the step succeeded, the note stays readable.
- `Settings` is a title input and a textarea, with the limits of `NOTE_STEP_LIMITS`.
- `title` returns the note's title, so the step is called "Before you book" and not "Read a note".

The Hire page (`client/src/routes/[domain]/hire/+page.svelte`) and the owner's editor
(`client/src/lib/components/admin/WorkflowsTab.svelte`) are generic: neither tests for a type name,
they only go through this registry and the manifests. A new step type does not need a change in
either. Three things the page does for every step:

- The owner previews their journey with no step locked. A `requirement` step shows its description
  to the owner instead of its controls, unless its entry sets `ownerPreview`; `access` steps are
  live for them.
- A journey of a single step is shown bare, without the list of steps (this is the booking page of
  a default journey).
- A step whose status is `failed` is shown as "Not passed".

### 4. Tests

- `server/tests/workflows.test.ts`: add a builder for your step next to `note()`, `job()` and
  `meeting()`, then cover its settings (`PUT /workflow` refusing each bad setting with the right
  `property`), what visitors see of it (`journeyOf`), and its submit (`submit`): every kind of bad
  `input` refused, a good one stored, the status that follows. The suite needs MongoDB and must
  pass in any order: each test creates its own users and removes them (see "Testing" in
  `CLAUDE.md`).
- `client/src/services/tests/workflow.test.ts` for pure client helpers, and
  `client/tests/hire-journey.test.ts` (Playwright) when the step changes what a visitor goes
  through on the page.

## Steps with routes of their own

The `meeting` step has no `submit`: the visitor books through the booking routes of
`server/plugins/appointments.ts`, which existed before journeys. A step type whose work happens in
other routes follows the same pattern, with two functions of `server/services/workflows.ts`:

- `openStepOfType(ownerId, visitorId, type, missing)` at the start of each route. It throws
  `missing()` when the owner's journey has no step of that type (the booking routes answer 404, like
  for a paused schedule), 401 when steps come before it and nobody is signed in, 403 when one of
  them did not succeed. The owner always passes. It returns the step's id and `invitationLines`,
  which collects the `describe` lines of the steps before it. With several steps of the type, it
  returns the first open one.
- `recordStepData(ownerId, visitorId, stepId, data)` once the work is done (the meeting step
  records `{ bookedAt }` after the booking is confirmed). It only updates the record a signed-in
  visitor already has with this owner, the one their first submit created. It never creates one: a
  booking page open to anyone keeps no trace of its visitors. A visitor who books without having
  submitted a step of this owner's journey therefore leaves no record, and the meeting step stays
  `pending` for them.

`assertStepOpen(ownerId, visitorId, stepId)` does the same check for a step you already know by id.

## Rules

1. **Settings are private unless `visitorConfig` returns them**, and what it returns is public,
   signed in or not. Return named fields, never the whole `config`.
2. **Validate every `input`.** It is `unknown` and comes from a browser. Check types, not
   truthiness: the note accepts `acknowledged: true` and refuses `1`, `'true'` and `[true]`. Store
   only what you built yourself, never `input` as it came.
3. **Never trust the client for the status.** The client does not send one and the engine stores
   none: `evaluate` computes it in the API at each read, and the API enforces the locks on the
   submit route and on the routes behind a step. A component that hides a locked step is a
   convenience, not a protection. Routes you add for a step must call `openStepOfType` or
   `assertStepOpen` themselves.
4. **`view` is for the visitor it is about.** Nothing of the owner's private settings, nothing of
   another visitor.
5. **Read `config` and `data` defensively.** Both come back from the database as an older version
   of the step may have written them.
6. **Check that what a visitor names is theirs.** The job step looks the posting up by id *and*
   recruiter, and answers 404 for someone else's posting, like for an unknown id.
7. **A step id is a storage key.** Ids match `WORKFLOW_LIMITS.stepId` (lowercase letters, digits and
   hyphens: no dot, no dollar). The route schemas and `parseWorkflow` both check it, and
   `progressPath` checks it again before building a field path. Do not build such a path any other
   way.
8. **Use plain text in `describe`.** Its lines go into a calendar invitation that the owner and the
   visitor both receive.

## Removing or renaming a type

A type removed from the registries stays in the journeys that were saved with it. Those journeys
stop at that step (it can never succeed), and their owner's editor refuses to save until the step
is removed ("This step is not available anymore: remove it."). Renaming a type is removing one and
adding another: the progress stored under the old steps is dropped when their owners save again.
There is no data migration for either case.

## Checks

From the repo root, with MongoDB running (`bun run db:up`):

```bash
TEST_MONGO_URL=mongodb://127.0.0.1:27017/portfolio-test bun run --cwd server test
bun run --cwd client test:unit
bun run typecheck
bun run lint
```

The Playwright suite (`bun run --cwd client test:e2e`) needs the API running and a seeded
database: see "Testing" in `CLAUDE.md`.

## What comes next

Nothing in this section is built. It says where the current shapes are meant to go, so that a new
step does not work against them.

- **Branches on success or failure.** Today the order of the list is the path, and a journey stops
  at a step that did not succeed. Steps have ids so that a journey can later carry transitions
  between step ids: where to go when a step succeeded, and where when it failed. The `failed`
  status exists for this. No step returns it yet. Until transitions exist, a step that returned it
  would block the journey exactly like a pending one, and the Hire page would show it as "Not
  passed".
- **A visual designer.** The owner's editor is a list with "Move up" and "Move down". Once journeys
  have branches, a list no longer shows them: the editor is expected to become a diagram of steps
  and transitions, built on the same manifests and `Settings` components.
