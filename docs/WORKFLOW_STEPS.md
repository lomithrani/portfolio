# Hiring journey steps

The Hire page of a portfolio (`/<domain>/hire`) is its **hiring journey**: the steps a visitor (a
recruiter) goes through, in the order the portfolio's owner chose. "Hire page" is its name in the
code and these docs only: people read neutral words, "Propose a role" (the link visitors follow,
and the page's title "Propose a role to <owner>") and "page for recruiters" (what the owner and
recruiters call it). This document explains how a
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
- `type`: the name of a **step type** (`note`, `job`, `job-match`, `meeting`).
- `config`: the settings of that step, whose shape belongs to its type (`{}` for a type without
  settings).

Three people meet in a journey. The **owner** of the portfolio chooses the steps in the admin tab
"Hiring journey". A **visitor** is anyone else who is signed in; they have progress. An
**anonymous** caller is not signed in: they see the steps, and have no progress.

A visitor stands on each step with a **status**: `pending` (not done yet, or to do again),
`succeeded`, or `failed`. One step produces `failed` today: the job match, for a job that scores
under the owner's minimum (see [A step that can fail](#a-step-that-can-fail-the-job-match)).
The one rule of the runtime is: **a step is open when every step before it has the status
`succeeded`** (`openWorkflowSteps` in `common/models/workflow.ts`). The first step is therefore
open to anyone, signed in or not. The owner previews their own journey and is never stopped by it.

A portfolio whose owner never chose anything has `DEFAULT_WORKFLOW_STEPS`: one `meeting` step, so
the Hire page is a booking page open to anyone.

An owner can also start from a **template** (`JOURNEY_TEMPLATES`, `journeyTemplate` in
`common/models/workflow.ts`), saved through `PUT /workflow` like any journey: `gate` is a note
(its title and text read from `workflowMessages.gateNote` when it is built, in the owner's
language, unless the owner's own are given), a job step, a job match (`DEFAULT_JOB_MATCH_MIN_SCORE`,
`showDetails: true`) and a meeting; `open` is `DEFAULT_WORKFLOW_STEPS`. Each template must pass
`parseWorkflow` as it is built, in every language (`client/src/services/tests/workflow.test.ts`,
`server/tests/workflows.test.ts`): a step type whose settings change must keep the templates valid.
The admin's "Get started" tab (`client/src/lib/components/admin/StartTab.svelte`) offers them in one
click, the gate's note editable first with the note step's settings form.

The engine (`server/services/workflows.ts`) owns the order, the locks and the storage. It knows
nothing about what a step is. A step type only answers two questions: where does this visitor
stand on me, and what may they submit?

### Where things are stored

| Model (`server/models/database/`) | What it holds |
| --- | --- |
| `Workflow` (`workflow.ts`, collection `hiringworkflows`, one per owner) | `steps: [{ id, type, config }]`, as `parseWorkflow` returned them. Written by `PUT /workflow` only. |
| `WorkflowInstance` (`workflowInstance.ts`, one per `(owner, visitor)`) | `steps`: a map from step id to `{ data, updatedAt }`, what each step stored for this visitor. Created by the visitor's first submit, or by a mutual interest of matching that leads the visitor into the journey (see [A job that comes from matching](#a-job-that-comes-from-matching)). |

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
| `GET /workflow` | owner (session) | Their steps, with their full settings, and whether they saved a journey (`false`: `DEFAULT_WORKFLOW_STEPS`): `{ steps: [{ id, type, config }], saved }`. |
| `PUT /workflow` | owner (session) | Replaces their steps. Answers the steps as stored (settings normalised), with `saved: true`. |
| `GET /workflow/domains/:domainName` | anyone | The journey as the caller stands in it: `{ steps: [{ id, type, status, config?, view? }], own?, match? }` (`match`: the visitor's mutual interest with the owner, see [A job that comes from matching](#a-job-that-comes-from-matching)). |
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
| `data` | What the step stored for one visitor (when they confirmed, which job they picked and the version of it they shared). | The server step: the return value of `submit`, or `recordStepData` for a step with routes of its own. | `WorkflowInstance.steps.<stepId>.data` | No route returns it. The step reads it back in `evaluate`, `submit` and `describe`. |
| `view` | What the visitor's page is told about their own progress on the step. | The server step's `evaluate`, computed at each read. | Not stored. | The signed-in visitor it is about, and nobody else. |
| `input` | What the visitor's browser sent on a submit. | The visitor. | Not stored. | The server step's `submit`, which must check it. |

Two consequences that are easy to miss:

- **What `visitorConfig` returns is public.** `GET /workflow/domains/:domainName` needs no session,
  so anonymous callers get it too, and the Hire page writes it into the HTML its server renders
  (what a link preview or a page without JavaScript reads). Return a setting there only when it is
  written for visitors.
- **The owner does not see a visitor's `data`.** The only thing that reaches the owner is what the
  step's `describe` puts in the meeting invitation, and what that invitation links: for the job
  step, the job's private page (`GET /opportunities/jobs/:id`, `server/services/jobAccess.ts`),
  which reads the job step's pick (`pickedJobId`, `storedShare`) to let the owner read the version
  of the posting shared on their journey. Nobody else reads it there but its recruiter and the
  other owners on whose journey that recruiter picked the same posting (a recruiter can pick one
  posting on several journeys).

## Adding a step: the note step, file by file

### 1. The manifest: `common/models/workflowSteps/note.ts`

The manifest is a `WorkflowStepManifest<Config>` (declared in `common/models/workflow.ts`):

| Field | Meaning |
| --- | --- |
| `type` | The type's unique name. It must match `WORKFLOW_LIMITS.stepType`: a lowercase letter, then lowercase letters, digits and hyphens, 40 characters at most. |
| `kind` | `requirement`: something the visitor does, which gives nothing by itself and only opens the steps after it (read a note, pick a job). `access`: what the journey leads to (book a meeting). A journey cannot be saved with a requirement step that has no access step after it, since it would open nothing. |
| `label` | The step's name, for the owner and the visitor ("Read a note"). A getter over a message, so it is read in the language in use (see below). |
| `description` | What the step asks of visitors, written for the owner who is choosing steps. A getter over a message too. |
| `max` | How many steps of this type a journey can have. Leave it unset for any number (the note), set `1` when a second one would make no sense (the job, the meeting). |
| `needs` | The step types a step of this type needs earlier in the journey, because it works on what the visitor did there (the job match needs `job`: it scores the job picked there). A journey cannot be saved without them before it. Leave it unset for a step that stands alone. |
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
	get label() {
		return m.note.label;
	},
	get description() {
		return m.note.description;
	},
	defaultConfig: () => ({ title: '', text: '' }),
	parseConfig
};
```

Every text of a step type exists in English and French (`docs/I18N.md`). The manifest's are
messages of `common/models/workflowSteps/workflowSteps.messages.ts`, one group per step type
(`m.note` above is `workflowStepMessages.note`): its `label`, its `description` and what its
`parseConfig` says of settings it refuses. `label` and `description` are getters because a
manifest is created once, when the module loads, while a message must be read when it is shown.
The texts of the API's step go in a `*.messages.ts` file next to it, those of the client's entry
next to its components.

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
`visitorId`, the step's `config`, `data`, what this step stored for this visitor (`undefined`
when nothing yet), `earlier`, the steps before this one in the journey (`{ id, type, data }`
each), for a type whose manifest has `needs`, and `later`, the steps after it (`{ id, type }` each:
what they stored is theirs), for a type whose submission matters to a step after it (the job step
caps the shares a job match after it scores). One more, `mutualInterest`, is set only when the
visitor came through matching (Path 2, CLAUDE.md "Matching"): the mutual interest between the owner
and this visitor that leads into the journey now (see
[A job that comes from matching](#a-job-that-comes-from-matching)); a step that has nothing to do
with matching ignores it.

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
      throw new FieldValidationError('input.acknowledged', () => m.note.confirmRead);
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
so keep it cheap: no query for the note, two indexed queries for the job. It is never called for the
owner or for an anonymous caller, who are `pending` on every step. A step may read more than its
own data: the job step loads the posting again and is `succeeded` only while it keeps a version
of that posting (below), the posting still belongs to the visitor and is open, and the visitor has
accepted the terms in force (like every recruiter route), so a posting closed since, or a change of
the terms, sends the visitor back to the step.

**`view`** is the part of `evaluate`'s answer the visitor's page receives. The note has none. The
job step returns `{ job: { _id, title, company?, status, sharedAt?, outdated? }, matched? }`: the
posting the visitor shared (its title and company as shared, its status now), when they shared that
version, and whether the posting differs from it now in anything the owner reads of it, so the page
can show it and offer to share the new version (`matched`: the job of a mutual interest, see
[A job that comes from matching](#a-job-that-comes-from-matching)). Put there only what this
visitor may know.

**A step can keep what the visitor submitted as it was then.** The job step stores the version of
the posting shared (`{ job, selectedAt, version, posting }`: `posting` is a `JobSnapshot` of
portfolio-common, the posting without its status, built by `toJobSnapshot` of
`server/services/jobPostings.ts`, normalised, its pay range brought down to the top it is scored
with), not a reference to the posting alone: what the owner reads on the job's private page, what
the job match scores and what the meeting invitation names is that version, and an edit of the
posting reaches them only once the recruiter shares it again. Read back, the version is checked
again (`storedJobSnapshot`: the request schema, then `normalizeJobPosting` and
`validateJobPosting`), and a pick without a valid one (stored before versions were kept, or written
by hand) holds nothing: the step is `pending` and the recruiter shares the job again. A rule made
tighter later (in `jobPostingRequest`, `normalizeJobPosting` or `validateJobPosting`) therefore
sends every version kept that breaks it back to `pending`: count those job steps before such a
release and say so in its deployment notes (`docs/DEPLOYMENT.md`, "Versions of shared jobs"), or
rewrite the versions kept. A posting saved under older rules that the check would refuse is refused
at the submit (422 on `input.jobId`) rather than stored and never holding. `outdated` is set when the
posting now differs from the version in anything (`jobSnapshotsDiffer` of portfolio-common: the
whole `JobSnapshot`, so not its status); a shared posting was opened, so its terms are locked and it
is in practice its description, or a field no criterion reads, that changed. A version must not
outlive the posting it copies: deleting a posting (`DELETE /jobs/:id`) drops, with
`dropVisitorProgress` of `server/services/workflows.ts`, what the job step stored of it on every
journey of its recruiter, and the step is to do again, as it was before versions were kept.

**`submit`** is reached through `POST /workflow/domains/:domainName/steps/:stepId` with a JSON body
`{ input }`. Before it is called, the engine (`submitStep`) has checked that the portfolio exists
(404), that the caller is not its owner (403), that the journey has this step (409 "This hiring
journey changed: reload the page") and that the step is open to the visitor (403). `input` is
`unknown`: use `inputFields(input)` (in `types.ts`) to read it as an object, check each field, and
throw a `FieldValidationError('input.<field>', () => m.<step>.<message>)` for a 422 that names the
field: the message is read from `server/services/workflowSteps/steps.messages.ts` when the error
is answered, so the visitor gets it in their language (`docs/I18N.md`, rule 8). Other
refusals use the error classes of `server/errors.ts` (the job step answers 404 for a posting that
is not the visitor's and 409 for one that is not open). A visitor can submit again: the latest
`data` replaces the previous one. A type can cap how often: the job step counts the shares of a
visitor on a journey that scores them (a job match after it, read from `ctx.later`, the steps after
this one: their ids and types), at most `JOB_STEP_LIMITS.scoredSharesPerDay` (5) per owner and
recruiter per UTC day (`takeRateLimit` with `rateLimitKey`, 429 with `Retry-After` beyond), since
each share is a score and many versions would tell the recruiter more of the owner's criteria than
a score is meant to. A refusal before the share (an id, a posting that is not open) counts nothing,
and neither does the job kept picked again unchanged (the step keeps it as it is, its date too):
the step selects that job when it opens, so pressing its button again tells nothing new.

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
job step returns `Job: <title> — <company>` (of the version shared) and, when the request came from
an allowed web origin,
a link to the job's private page on that origin (`opportunityPath(id)` of portfolio-common,
`/opportunities/<id>`: the page and the link share it, so they cannot drift apart). Only its
recruiter and the portfolio owners on whose journey the recruiter picked it can open it, signed in
(each owner reads the version shared on their journey, while it is the recruiter's current pick
there and not a draft: a
recruiter can pick one posting on several journeys; a pick stored before versions were kept, the
posting's id and date alone (`legacyPick` of the job step), shows the posting as it is now, and a
version that no longer checks out shows nothing); anyone else reads that it is not shared with
them. The old `/jobs/<id>` of invitations sent before answers 308 to it. A job that comes from
matching adds `Mutual interest on Portfolio` (« Intérêt réciproque sur Portfolio ») after the job's
line. The note describes nothing.

### 3. The client entry: `client/src/lib/components/hire/steps/`

The registry `client/src/lib/components/hire/steps/index.ts` maps a type name to an entry:

| Field | Required | What it is |
| --- | --- | --- |
| `Visitor` | yes | The Svelte component the Hire page mounts for the step. |
| `Settings` | no | The component of the step's settings form in the owner's editor. Leave it out for a type without settings. |
| `note(step, state)` | yes | The line under the step's name: what it asks, or what the visitor did there. |
| `title(step)` | no | The step's name when it is not the manifest's label. The note returns its `config.title`. |
| `failedNote(step)` | no | The line under the step's name for a visitor who did not pass it, for a type that can return `failed`; "Not passed." when unset. |
| `wantsOpen(step, address)` | no | Whether the address asks for this step to be shown unfolded. The job step uses it when the address carries a `?job=` other than the job picked. |
| `reopenLabel(step)` | no | What the button that unfolds the step says once it is done, for that step (`JourneyStep`): a label ("Change" for the job step), or `undefined` for "Open" (the job step returns `undefined` while a mutual interest holds its job); "Open" when unset. |
| `ownerPreview` | no | Set it to `true` when the owner's preview should show the step itself (the note, without its button) instead of the manifest's description. The `Visitor` then gets `journey.own` and must offer the owner nothing to submit: the API refuses the owner on their own journey. |
| `effort` | yes | What the step takes from a visitor, said in "Before you start" on the Hire page before they start: `asks(step, ownerName)` (what it asks, in a sentence, from the settings visitors get of it: the job match says its minimum), `minutes` (about how long it takes; 0 for a step worked out for them, as the job match is) and `needs` (what to have at hand, each a `StepNeed` of `types.ts` whose text is in `needs` of `steps.messages.ts`: `googleAccount` for a step the visitor submits, which needs a session; `jobDescription` for the job step; none for a meeting alone, which is booked signed out). The card says each need once and adds up the minutes. A step whose time varies says so in `asks` (the job step counts a pick's minutes, and says writing a job description takes longer). It is rendered on the server from the journey as anyone signed out gets it, so `asks` reads only `step.config` (what `visitorConfig` returns), never `step.view`. `registry.test.ts` fails when an entry has none, or says nothing in a language. |
| `goal` | for an `access` type | What the Hire page says under its title when the journey leads to this step (the title is the same for every journey, "Propose a role to <owner>"): `alone` (the line when the step is the whole journey) and `after` (the same line when steps come before it), and `next(ownerName)`, what happens once it is done ("Before you start": the meeting's says the calendar invitation, and that only then does the owner get the recruiter's name and email address). `booking: true` for a step that books the owner's calendar (the meeting): it can be done only while the calendar offers a meeting type, which the page knows as `bookable`; otherwise the page promises nothing of it (its intro says the owner takes no meeting requests online, no "Before you start", a description without the steps). Read the texts when they are shown (getters over the messages), never into a constant. `registry.test.ts` fails when an `access` type has none. |

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
| `bookable` | Whether the owner's calendar offers a meeting type to book (`GET /appointments/domains/:domainName/schedules`, which lists only those with hours, as the readiness checklist counts them; asked by the server's render, and again in the browser unless the render found one), null while not known. The meeting step starts from it, so that "Online booking is not available right now." is in the server's HTML. |
| `schedulesFound(count)` | Tells the page how many meeting types the step found when it asked for them: the page follows it. |

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
either. Four things the page does for every step:

- It is rendered on the server (`+page.server.ts`) from the journey as anyone signed out stands in
  it: `GET /workflow/domains/:domainName` without a session, so each step's `config` is what its
  `visitorConfig` returns and nothing else, and no `view`. The first step is shown open, the rest
  locked, with "Before you start" (`hire/BeforeYouStart.svelte`, from each entry's `effort` and the
  goal's `next`) above them, unless the goal is a `booking` and the owner's calendar offers nothing
  to book (`bookable` false: then the steps stay read-only for visitors, none unfolds or takes a
  submission, until a meeting can follow them). The browser then loads the journey again with the session; until it
  answers, a visitor the kept session names gets no control on the steps (the server's are anyone
  signed out's). So the `Visitor` of a step that can be the first one must render on the server:
  no `window`, `document` or storage outside event handlers and effects, and its loading states
  hold their place without words (a placeholder, its status for screen readers only, hidden
  where scripts do not run with `noscript:hidden`: nothing would replace it), as
  `MeetingBooking.svelte` does for the meeting types. `client/src/services/tests/hirePageRender.test.ts`
  renders, with a meeting type to book, a journey starting with each type that can come first (a
  `requirement` type without `needs`), unfolded; `client/tests/hire-journey.test.ts` loads them
  with JavaScript off (the e2e API books nothing: listed, read-only).

- The owner previews their journey with no step locked. A `requirement` step shows its description
  to the owner instead of its controls, unless its entry sets `ownerPreview`; `access` steps are
  live for them.
- A journey of a single step is shown bare, without the list of steps (this is the booking page of
  a default journey).
- A step whose status is `failed` is marked as not passed and stays unfolded for the visitor: its
  `Visitor` says why, and its `failedNote` is the line under its name ("Not passed." without one).
  The steps after it are locked.

### 4. Tests

- `server/tests/workflows.test.ts`: add a builder for your step next to `note()`, `job()`,
  `jobMatch()` and `meeting()`, then cover its settings (`PUT /workflow` refusing each bad setting with the right
  `property`), what visitors see of it (`journeyOf`), and its submit (`submit`): every kind of bad
  `input` refused, a good one stored, the status that follows. The suite needs MongoDB and must
  pass in any order: each test creates its own users and removes them (see "Testing" in
  `CLAUDE.md`).
- `client/src/services/tests/workflow.test.ts` for pure client helpers, and
  `client/tests/hire-journey.test.ts` (Playwright) when the step changes what a visitor goes
  through on the page.

## A step that can fail: the job match

The `job-match` step ("Get the job scored") scores the version of the job the visitor shared on
the job step against the owner's **perfect job**, and returns `failed` under the minimum score the
owner set in the step's settings. It is the example of three things no other step does.

**It works on another step's data.** Its manifest has `needs: ['job']`, so `parseWorkflow`
refuses a journey where no job step comes before it. Its `evaluate` finds the nearest job step in
`ctx.earlier` and reads the version shared with a helper the job step exports (`pickedSnapshot` in
`server/services/workflowSteps/job.ts`): a step never reads another step's `data` by itself, it
goes through the helpers of the type that wrote it. `pickedSnapshot` checks the version again, and
that the posting is still the visitor's and that they accepted the terms in force; without a valid
version it returns nothing, and the step scores nothing.

**It stores nothing and takes no submission.** The score is computed at each read, from the
version shared and the owner's criteria as it is now (`scorePerfectJob` in
`common/models/perfectJob.ts`, which is pure and tested in
`server/tests/perfectJobScore.test.ts`). The recruiter sharing another posting (or a new version of
the same one), or the owner changing their criteria or the minimum, change the status at the next
read; an edit of the posting does not until it is shared again. A posting picked was opened, so
the fields the score reads are locked (`LOCKED_JOB_FIELDS`): editing it cannot change its score,
and the step offers to duplicate it instead
(`/recruiter/jobs/new?duplicate=<id>&journey=<domain>`: a new draft that, once created, comes back
to the Hire page with `?job=<id>`, to be opened and picked).

**It reads something private of the owner's.** The perfect job (`GET`/`PUT /perfect-job`, model
`PerfectJob`, admin tab "Perfect job") is the owner's alone. `visitorConfig` returns the minimum
score only. The `view` holds the score, the minimum and the job scored; with the owner's
`showDetails` setting, also the name of each criterion and how the job does on it (`match`,
`partial`, `miss`, whether the posting states it, whether it is a deal-breaker that was missed),
and never what the owner asks for or how much a criterion weighs. A recruiter can still learn
about the criteria by trying postings: this is inherent to a gate, and the reason the details
are the owner's choice.

The same `showDetails` also decides what matching (Path 2, CLAUDE.md "Matching") shows of a
job's outcomes beside the owner's anonymous card: with it, the outcome of each criterion but the
commute and the places (portfolio-common's `cardOutcomeCriteria`), without it none, so that one
setting decides what recruiters learn of a job's outcomes on both paths.
`server/services/candidateCard.ts` (`candidateCardPreview`, and the feeds after it) reads it from
the journey's `job-match` step: renaming or reshaping the step's config means changing it there
too.

One criterion, the commute, needs something neither the posting nor the criteria hold: a travel
time. The step asks `commuteContext` (`server/services/commute.ts`) for it before scoring, which
answers from a cache or from outside services, once per posting. When it is not known (travel
times are off, a service did not answer), the criterion is left out of the score instead of
failing the visitor: an outage of someone else's service must not close a journey.

A stored minimum that is not a score (written by hand) reads as 100: the step fails closed.
An owner without any criterion asks nothing: every job scores 100.

## A job that comes from matching

Matching (Path 2, CLAUDE.md "Matching", behind the API's `MATCHING` flag) is the other way a
recruiter reaches an owner: the owner, proposed to recruiters as an anonymous card, and a recruiter
are both interested in one of the recruiter's open jobs (a **mutual interest**, a `Match` of
`server/models/database/match.ts`, made by `server/services/matches.ts`). It leads into the owner's
own journey, the one their page for recruiters shows: matching has no journey of its own, and the
same steps, notes and meeting apply.

**The engine reads it, the steps decide what it means.** `loadJourney` of
`server/services/workflows.ts` reads, once per journey and only for a signed-in visitor who is not
the owner, the latest mutual interest between the owner (the candidate) and the visitor (the
recruiter) that leads somewhere now (`activeMutualInterest` of `server/services/mutualInterests.ts`:
both interested, the portfolio revealed, not ended, its version reading back as a share does: one
that a rule of job descriptions made tighter since breaks leads nowhere, and the recruiter shares a
job as anyone does; none while `MATCHING` is off), and hands it to
every step as `ctx.mutualInterest`, with what the candidate said yes to (`posting`, the version of
the job, read back like a share; `score`, `minScore` and `criteria` then; `matchedAt`; `changedAt`).
`GET /workflow/domains/:domainName` says it to that visitor as `match`
(`{ _id, job: { _id, title, company? }, matchedAt, changed? }`); nobody else gets it.

- **The job step holds its job.** While a mutual interest leads there, `evaluate` shows its job (the
  version said yes to, `sharedAt` the mutual interest's date) with `matched: true`, and succeeds
  while the posting is the recruiter's and open and they accepted the terms in force, as for a
  share; it never says `outdated` (the version kept is the one both said yes to). `submit` answers
  409 `JOB_OF_MUTUAL_INTEREST` (`server/protocol.ts`): the recruiter cannot share another job while
  it lasts. `describe` adds the line above (`mutualInterestLines`: the job, "Mutual interest on
  Portfolio", its private page). On a journey without a job step before the meeting (the owner took
  it out since, or kept the meeting alone), the engine adds those lines itself
  (`openStepOfType`'s `invitationLines`), so the invitation always names the job they met over.
- **The job match is frozen.** It is not scored again: `evaluate` succeeds with the score, the
  minimum and the outcomes of the mutual interest (the outcomes only while the owner's
  `showDetails` is on, as for a job scored), and says `matched: true` and `frozenAt` (when they both
  became interested), whatever the owner's criteria or minimum became since: their interest is their
  yes to that job. A frozen score under its minimum, which only a record not written by a mutual
  interest can hold (`readMutualInterest` reads what is not a score as 0 and what is not a minimum
  as 100), is `failed`: it fails closed. `describe` says that score.
- **The notes and the meeting are as for anyone.** A note before or after the job is still the
  recruiter's to confirm, and the meeting opens once every step before it succeeded.

**What is stored.** When the mutual interest is made, `handOffToJourney` of
`server/services/matches.ts` records it in the visitor's progress (`seedVisitorProgress` of the
engine, which creates it when the recruiter had none): the job step's data is the share of the
version said yes to plus `match` (its id: `mutualInterestShare` of the job step), the job match's
`{ via: 'mutual_match', match, job, frozenAt }` (`freezeJobMatch` of `jobMatch.ts`); on a journey
without a job step, the visitor's progress alone, so that `recordStepData` records the meeting they
book (see below). The steps read
the mutual interest itself, not this record, so a journey the owner edits since (its job step
removed and added again: a new id, nothing stored under it) still leads there, and a record that
failed to be written changes nothing. What a mutual interest stored holds nothing once it no longer
leads there (ended, or `MATCHING` off): the job step is `pending` with no view, the job match scores
nothing from it (`pickedSnapshot` leaves it out), the job's private page reads it through the mutual
interest (`access: 'match'`), never as a pick (nor do the feeds of matching read it as one). Ending
a mutual interest (`POST /matches/:id/end`), or its job ending it (filled, closed or back to draft:
`afterJobStatusChange` of `server/services/jobMatching.ts`), removes the record (`dropHandOffs`), so
the recruiter's job step is to do again, as anyone's, and nothing of it outlives the match; deleting
the posting removes it with the shares of that job (the job match's record names the job for
that). A new step type that should behave differently for a job that comes from matching reads
`ctx.mutualInterest`, never the Match itself.

**On the page for recruiters** (client). The page reads `match` with `journeyMatch` of
`client/src/services/workflow.ts` (an answer that is not one is no mutual interest: the page is
anyone's), only from a journey loaded with the session (the server's render is anyone signed out's),
and shows `client/src/lib/components/hire/MatchBanner.svelte` above the steps in place of "Before you
start" (the recruiter came through matching): "You're both interested", the job they met over (a link
to its page in their recruiter space), since when, edited since (`changed`), that this page holds that
job (only while its job step succeeded with it: `mutualInterestJob`) or that the invitation names it
(a journey without one), what is left before the meeting (`mutualInterestNext`: what brings back a job
the step does not hold now, the posting open again or the terms in force accepted; then the steps not
done, by their type's phrase, or that nothing else is asked; never a meeting nobody can book), what
happens once it is booked (the goal's `next`, as "Before you start" says it), and "End it" (asked
first, saying that a meeting already booked stays booked; a refusal for the terms in force asks for
them in the banner; the page then reads the journey again, where the job step is to do as for anyone,
and a read that fails puts the server's journey, anyone's, in place of the steps it held). Shown, the
mutual interest is marked seen, each time the banner shows. When a later read of the journey (a step
refused, a note confirmed) no longer has the mutual interest the page showed, the page says so in a
toast, rather than "Complete the steps first", and the focus goes to the step shown. The job step's
`view.matched` is read by
`pickedJob` (`matched`, never `outdated`): `JobStep.svelte` shows that job, with no list to pick
another, nothing to share again and no "Change" (`reopenLabel` is a function of the step), and while
it does not hold, what brings it back (the posting open again, with a link to its page, or the terms
in force, `TermsAcceptance`); `asksForAnotherJob` ignores `?job=` while it holds; the 409
`JOB_OF_MUTUAL_INTEREST` of a share from a page loaded before the mutual interest is said in words
(`pickJobFailure`, `matched`: a toast, and the journey loaded again, the focus on the step shown). The
job match's `view.matched` and `frozenAt` are read by `jobMatch`: `JobMatchStep.svelte` says "Score
when you were both interested, on <day>", that it no longer changes, and offers neither "Check again"
nor a duplicate (a frozen score under its minimum says that ending the mutual interest is the way to
share another job). A step a mutual interest holds says what it holds even while a step before it is
to do (`stepNote`: the note first, the job and its score after it), and a job it does not hold now
what brings it back.

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
  visitor already has with this owner, the one their first submit created (or a mutual interest of
  matching that led them there). It never creates one: a
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
   recruiter, and answers 404 for someone else's posting, like for an unknown id. What it keeps of
   it is the version shared, read back with `storedJobSnapshot`: the posting edited since does not
   change what the owner reads until the recruiter shares it again.
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
  status exists for this. The job match returns it today; until transitions exist, it blocks the
  journey exactly like a pending step, and the Hire page shows the step as not passed, with what
  its type says about it.
- **A visual designer.** The owner's editor is a list with "Move up" and "Move down". Once journeys
  have branches, a list no longer shows them: the editor is expected to become a diagram of steps
  and transitions, built on the same manifests and `Settings` components.
