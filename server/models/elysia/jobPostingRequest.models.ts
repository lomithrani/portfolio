import { t } from "elysia";
import {
  EDUCATION_LEVELS,
  FR_CONTRACT_TYPES,
  JOB_COUNTRIES,
  JOB_LIMITS,
  JOB_STATUSES,
  PAY_CURRENCIES,
  PAY_PERIODS,
  SENIORITY_LEVELS,
  TRAVEL_FREQUENCIES,
  USER_MODES,
  WORKING_TIME_ARRANGEMENTS,
  WORK_MODES
} from "portfolio-common";

// Body of POST /jobs and PUT /jobs/:id: portfolio-common's JobPostingInput.
// The schema checks types, lengths and list sizes; the rules it cannot
// express (a city unless fully remote, a duration for fixed-term contracts,
// ranges, min <= max...) are portfolio-common's validateJobPosting, answered
// as a 422 naming the field (FieldValidationError).

const line = (maxLength: number) => t.String({ maxLength });
const list = (maxItems: number) => t.Array(line(JOB_LIMITS.listItem), { maxItems });
// t.UnionEnum defaults to its first value, which Elysia fills in for a
// missing field: a posting without travel would be stored with 'none', a
// status change without a status would make a draft. Missing stays missing
const noDefault = { default: undefined };

export const jobStatus = t.UnionEnum(JOB_STATUSES, noDefault);

export const jobPostingRequest = t.Object({
  title: t.String({ minLength: 1, maxLength: JOB_LIMITS.title }),
  description: t.String({ minLength: 1, maxLength: JOB_LIMITS.description }),
  company: t.Optional(line(JOB_LIMITS.company)),
  status: jobStatus,
  openings: t.Optional(t.Number()),
  location: t.Object({
    country: t.UnionEnum(JOB_COUNTRIES, noDefault),
    city: t.Optional(line(JOB_LIMITS.city)),
    postalCode: t.Optional(line(JOB_LIMITS.postalCode)),
    workMode: t.UnionEnum(WORK_MODES, noDefault),
    remoteDaysPerWeek: t.Optional(t.Number())
  }),
  contract: t.Object({
    type: t.UnionEnum(FR_CONTRACT_TYPES, noDefault),
    durationMonths: t.Optional(t.Number()),
    // YYYY-MM-DD, checked to be a real date by validateJobPosting
    startDate: t.Optional(t.String({ maxLength: 10 })),
    trialPeriodMonths: t.Optional(t.Number()),
    collectiveAgreement: t.Optional(line(JOB_LIMITS.collectiveAgreement))
  }),
  workingTime: t.Object({
    arrangement: t.UnionEnum(WORKING_TIME_ARRANGEMENTS, noDefault),
    hoursPerWeek: t.Optional(t.Number()),
    daysPerYear: t.Optional(t.Number()),
    rttDaysPerYear: t.Optional(t.Number())
  }),
  pay: t.Object({
    min: t.Number(),
    max: t.Number(),
    currency: t.UnionEnum(PAY_CURRENCIES, noDefault),
    period: t.UnionEnum(PAY_PERIODS, noDefault),
    variable: t.Optional(line(JOB_LIMITS.variablePay))
  }),
  organization: t.Optional(t.Object({
    directReports: t.Optional(t.Number()),
    peers: t.Optional(t.Number()),
    levelsToCeo: t.Optional(t.Number())
  })),
  requirements: t.Optional(t.Object({
    seniority: t.Optional(t.UnionEnum(SENIORITY_LEVELS, noDefault)),
    education: t.Optional(t.UnionEnum(EDUCATION_LEVELS, noDefault)),
    skills: t.Optional(list(JOB_LIMITS.skills)),
    languages: t.Optional(list(JOB_LIMITS.languages))
  })),
  benefits: t.Optional(list(JOB_LIMITS.benefits)),
  travel: t.Optional(t.UnionEnum(TRAVEL_FREQUENCIES, noDefault))
});

/** Body of PUT /jobs/:id/status */
export const jobStatusRequest = t.Object({ status: jobStatus });

/** Body of POST /jobs/:id/applicants: the portfolio (domain name) to add */
export const jobApplicantRequest = t.Object({
  domain: t.String({ minLength: 1, maxLength: 255 })
});

/** Route params of an applicant of a job posting */
export const jobApplicantParams = t.Object({
  id: t.String({ pattern: '^[0-9a-fA-F]{24}$' }),
  applicationId: t.String({ pattern: '^[0-9a-fA-F]{24}$' })
});

/** Body of PUT /me/mode, and the optional mode of POST /login */
// No default: t.UnionEnum defaults to its first value, which Elysia fills in
// for a missing field (a /login without a mode would switch to 'candidate')
export const userMode = t.UnionEnum(USER_MODES, { default: undefined });

/**
 * Body of POST /jobs/import. The file's size and type are checked by
 * services/jobImport.ts (413 / 422 with a clear message, not a schema error);
 * its length is bounded by the server's request body cap (app.ts).
 */
export const jobImportRequest = t.Object({
  file: t.String({
    minLength: 1,
    description:
      'The PDF, base64-encoded (standard alphabet, padded). A data:application/pdf;base64, prefix is accepted'
  }),
  fileName: t.Optional(
    t.String({ maxLength: 255, description: 'Name of the uploaded file, given to the model as the document title' })
  )
});
