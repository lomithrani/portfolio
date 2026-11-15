import type { JobPostingInput } from 'portfolio-common';

// Job postings that state every field a posting can have, between them (one
// posting cannot: weekly hours and days a year exclude each other). Shared by
// the tests that check that the API, the import and the scoring of the
// perfect job each carry every field (portfolio-common's JOB_FIELD_CRITERIA).

const complete: JobPostingInput = {
  title: 'Staff Backend Engineer',
  description: '## The job\n\nBuild the platform.',
  company: 'Acme',
  status: 'open',
  openings: 2,
  location: {
    country: 'FR',
    city: 'Lyon',
    postalCode: '69003',
    address: '12 rue de la République',
    workMode: 'hybrid',
    remoteDaysPerWeek: 2
  },
  contract: {
    type: 'cdd',
    durationMonths: 12,
    startDate: '2027-01-04',
    trialPeriodMonths: 2,
    collectiveAgreement: 'Syntec'
  },
  workingTime: { arrangement: 'weekly_hours', hoursPerWeek: 37, rttDaysPerYear: 10 },
  pay: { min: 30, max: 40, currency: 'EUR', period: 'hour', variable: 'Up to 10% bonus' },
  organization: { directReports: 3, peers: 5, levelsToCeo: 2 },
  requirements: { seniority: 'senior', education: 'bac_5', skills: ['TypeScript', 'Go'], languages: ['English (C1)'] },
  benefits: ['Meal vouchers'],
  travel: 'occasional'
};

/** The same job on site, counted in days a year and paid by the day */
const inDays: JobPostingInput = {
  ...complete,
  location: { ...complete.location, workMode: 'on_site', remoteDaysPerWeek: undefined },
  workingTime: { arrangement: 'annual_days', daysPerYear: 215, rttDaysPerYear: 10 },
  pay: { ...complete.pay, min: 500, max: 600, period: 'day' }
};

export const COMPLETE_POSTINGS: readonly JobPostingInput[] = [complete, inDays];

/** The dotted paths of the values an object holds (a list is a value; what is unset has none) */
export const fieldPaths = (value: object, prefix = ''): string[] =>
  Object.entries(value).flatMap(([key, item]) => {
    if (item === undefined || item === null) return [];
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof item === 'object' && !Array.isArray(item) ? fieldPaths(item, path) : [path];
  });
