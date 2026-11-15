// The perfect job of portfolio-common (common/models/perfectJob.ts): the
// rules of the criteria a candidate rates (parsePerfectJob) and the score of
// a job posting against them (scorePerfectJob). Pure: no database.
import { describe, it, expect } from 'bun:test';
import {
  IMPORTANCE_LEVELS,
  PERFECT_JOB_CRITERIA,
  PERFECT_JOB_CRITERION_LABELS,
  JOB_FIELD_CRITERIA,
  JOB_FIELD_PATHS,
  PERFECT_JOB_LIMITS,
  criterionJobFields,
  normalizeJobPosting,
  officeAddress,
  officeDaysPerWeek,
  validateJobPosting,
  parsePerfectJob,
  ratedCriteria,
  scorePerfectJob,
  storedPerfectJob
} from 'portfolio-common';
import type { JobFieldPath, JobPostingInput, PerfectJob, PerfectJobCriterion, ScoredJob } from 'portfolio-common';
import { COMPLETE_POSTINGS, fieldPaths } from './completePostings';

/** A posting with only what a posting must say */
const posting = (fields: Partial<ScoredJob> = {}): ScoredJob => ({
  title: 'Senior Backend Engineer',
  location: { country: 'FR', city: 'Lyon', postalCode: '69003', workMode: 'hybrid', remoteDaysPerWeek: 2 },
  contract: { type: 'cdi' },
  workingTime: { arrangement: 'weekly_hours', hoursPerWeek: 35 },
  pay: { min: 50000, max: 60000, currency: 'EUR', period: 'year' },
  ...fields
});

/** How `job` does on the one criterion of `perfectJob`: its match, and whether the posting says it */
const match = (perfectJob: PerfectJob, job: ScoredJob = posting()) => {
  const { criteria } = scorePerfectJob(perfectJob, job);
  expect(criteria).toHaveLength(1);
  return criteria[0].stated ? criteria[0].match : 'not stated';
};

describe('parsePerfectJob', () => {
  it('keeps the criteria it knows, cleaned, in its own order', () => {
    const { criteria, problems } = parsePerfectJob({
      travel: { importance: 2, max: 'occasional', other: true },
      skills: { importance: 5, dealBreaker: true, names: [' TypeScript ', 'typescript', '', 'Go'] },
      workMode: { importance: 4, dealBreaker: 'yes', modes: ['remote', 'hybrid', 'remote'], minRemoteDays: 3 },
      pay: { importance: 3, perYear: 70000, perDay: null },
      titles: null,
      unknown: { importance: 5 }
    });
    expect(problems).toEqual([]);
    expect(criteria).toEqual({
      workMode: { importance: 4, modes: ['hybrid', 'remote'], minRemoteDays: 3 },
      pay: { importance: 3, perYear: 70000 },
      skills: { importance: 5, dealBreaker: true, names: ['TypeScript', 'Go'] },
      travel: { importance: 2, max: 'occasional' }
    });
    expect(ratedCriteria(criteria)).toEqual(['workMode', 'pay', 'skills', 'travel']);
    expect(Object.keys(criteria)).toEqual(['workMode', 'pay', 'skills', 'travel']);
  });

  it('drops the settings that do not apply', () => {
    const { criteria, problems } = parsePerfectJob({
      workMode: { importance: 3, modes: ['remote'], minRemoteDays: 3 },
      workingTime: { importance: 3, arrangements: ['annual_days'], maxHoursPerWeek: 35 }
    });
    expect(problems).toEqual([]);
    expect(criteria).toEqual({
      workMode: { importance: 3, modes: ['remote'] },
      workingTime: { importance: 3, arrangements: ['annual_days'] }
    });
  });

  it('accepts nothing at all, and refuses what is not an object', () => {
    expect(parsePerfectJob({})).toEqual({ criteria: {}, problems: [] });
    for (const raw of ['remote', 5, ['pay'], true, undefined, null]) {
      expect(parsePerfectJob(raw).problems).toEqual([{ field: 'criteria', message: 'Criteria must be an object.' }]);
    }
    expect(parsePerfectJob({ pay: 'a lot' }).problems).toEqual([{ field: 'pay', message: 'This criterion is not valid.' }]);
  });

  it('names every setting that breaks a rule', () => {
    const fields = (raw: unknown) => parsePerfectJob(raw).problems.map((problem) => problem.field);
    for (const importance of [0, 6, 2.5, '3', undefined, null]) {
      expect(fields({ travel: { importance, max: 'none' } })).toEqual(['travel.importance']);
    }
    expect(fields({ titles: { importance: 3, keywords: [] } })).toEqual(['titles.keywords']);
    expect(fields({ titles: { importance: 3, keywords: ['   '] } })).toEqual(['titles.keywords']);
    expect(fields({ titles: { importance: 3, keywords: 'CTO' } })).toEqual(['titles.keywords']);
    expect(fields({ titles: { importance: 3, keywords: [5] } })).toEqual(['titles.keywords']);
    expect(fields({ titles: { importance: 3, keywords: ['x'.repeat(PERFECT_JOB_LIMITS.listItem + 1)] } })).toEqual([
      'titles.keywords'
    ]);
    const tooMany = Array.from({ length: PERFECT_JOB_LIMITS.titles + 1 }, (_, index) => `Title ${index}`);
    expect(fields({ titles: { importance: 3, keywords: tooMany } })).toEqual(['titles.keywords']);
    expect(fields({ seniority: { importance: 3, levels: [] } })).toEqual(['seniority.levels']);
    expect(fields({ seniority: { importance: 3, levels: ['senior', 'guru'] } })).toEqual(['seniority.levels']);
    expect(fields({ management: { importance: 3, role: 'boss' } })).toEqual(['management.role']);
    expect(fields({ workMode: { importance: 3, modes: ['hybrid'], minRemoteDays: 5 } })).toEqual(['workMode.minRemoteDays']);
    expect(fields({ workMode: { importance: 9, modes: [], minRemoteDays: 0 } })).toEqual([
      'workMode.importance',
      'workMode.modes',
      'workMode.minRemoteDays'
    ]);
    expect(fields({ cities: { importance: 3 } })).toEqual(['cities.places']);
    expect(fields({ contractTypes: { importance: 3, types: ['cdi', 'gig'] } })).toEqual(['contractTypes.types']);
    expect(fields({ workingTime: { importance: 3, arrangements: ['weekly_hours'], maxHoursPerWeek: 60 } })).toEqual([
      'workingTime.maxHoursPerWeek'
    ]);
    expect(fields({ rttDays: { importance: 3, min: 0 } })).toEqual(['rttDays.min']);
    expect(fields({ pay: { importance: 3 } })).toEqual(['pay.perYear']);
    expect(fields({ pay: { importance: 3, perYear: 0, perDay: 500.5 } })).toEqual(['pay.perYear', 'pay.perDay']);
    expect(fields({ pay: { importance: 3, perYear: '70000' } })).toEqual(['pay.perYear']);
    expect(fields({ travel: { importance: 3, max: 'always' } })).toEqual(['travel.max']);
    // In the editor's order, whatever the order they were sent in
    expect(fields({ travel: { importance: 3 }, titles: { importance: 3 } })).toEqual(['titles.keywords', 'travel.max']);
  });

  it('keeps the place of a commute only when it is one', () => {
    const commute = { importance: 4, from: '  1 rue   du Test, Lyon ', modes: ['car', 'transit'], maxMinutesPerWeek: 300 };
    const stored: NonNullable<PerfectJob['commute']> = {
      importance: 4,
      from: '1 rue du Test, Lyon',
      modes: ['transit', 'car'],
      maxMinutesPerWeek: 300
    };
    expect(parsePerfectJob({ commute }).criteria).toEqual({ commute: stored });
    const place = { label: '1 Rue du Test 69001 Lyon', lat: 45.767, lon: 4.834 };
    expect(parsePerfectJob({ commute: { ...commute, place: { ...place, other: 1 } } }).criteria).toEqual({
      commute: { ...stored, place }
    });
    for (const bad of ['Lyon', { label: 'Lyon' }, { ...place, lat: 91 }, { ...place, lon: '4.8' }, { ...place, lat: Number.NaN }]) {
      expect(parsePerfectJob({ commute: { ...commute, place: bad } })).toEqual({ criteria: { commute: stored }, problems: [] });
    }
    const fields = (raw: unknown) => parsePerfectJob({ commute: raw }).problems.map((problem) => problem.field);
    expect(fields({ importance: 3 })).toEqual(['commute.from', 'commute.modes', 'commute.maxMinutesPerWeek']);
    expect(fields({ ...commute, from: 'x'.repeat(PERFECT_JOB_LIMITS.address + 1) })).toEqual(['commute.from']);
    expect(fields({ ...commute, modes: ['teleport'] })).toEqual(['commute.modes']);
    expect(fields({ ...commute, maxMinutesPerWeek: 9 })).toEqual(['commute.maxMinutesPerWeek']);
    expect(fields({ ...commute, maxMinutesPerWeek: 300.5 })).toEqual(['commute.maxMinutesPerWeek']);
  });

  it('reads stored criteria one by one: what is not a criterion anymore is left out', () => {
    expect(
      storedPerfectJob({
        pay: { importance: 3, perYear: 70000 },
        travel: { importance: 3, max: 'weekly' },
        seniority: { importance: 7, levels: ['senior'] }
      })
    ).toEqual({ pay: { importance: 3, perYear: 70000 } });
    expect(storedPerfectJob('nothing')).toEqual({});
  });

  it('has a name for every criterion', () => {
    for (const criterion of PERFECT_JOB_CRITERIA) expect(PERFECT_JOB_CRITERION_LABELS[criterion]).toBeTruthy();
    expect(IMPORTANCE_LEVELS).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('scorePerfectJob', () => {
  it('scores 100 when nothing is asked', () => {
    expect(scorePerfectJob({}, posting())).toEqual({ score: 100, criteria: [], broken: false });
  });

  it('weighs each criterion by its importance', () => {
    const perfectJob: PerfectJob = {
      workMode: { importance: 5, modes: ['remote'] },
      contractTypes: { importance: 3, types: ['cdi'] },
      pay: { importance: 2, perYear: 50000 }
    };
    // Contract and pay match: 5 of 10
    expect(scorePerfectJob(perfectJob, posting())).toEqual({
      score: 50,
      broken: false,
      criteria: [
        { criterion: 'workMode', importance: 5, dealBreaker: false, match: 0, stated: true },
        { criterion: 'contractTypes', importance: 3, dealBreaker: false, match: 1, stated: true },
        { criterion: 'pay', importance: 2, dealBreaker: false, match: 1, stated: true }
      ]
    });
    const remote = posting({ location: { country: 'FR', workMode: 'remote' } });
    expect(scorePerfectJob(perfectJob, remote).score).toBe(100);
    // Rounded to a whole number
    expect(
      scorePerfectJob(
        { workMode: { importance: 1, modes: ['remote'] }, contractTypes: { importance: 2, types: ['cdi'] } },
        posting()
      ).score
    ).toBe(67);
  });

  it('scores 0 when a deal-breaker is not matched at all, and only then', () => {
    const perfectJob: PerfectJob = {
      contractTypes: { importance: 1, types: ['cdi'] },
      workMode: { importance: 1, dealBreaker: true, modes: ['remote', 'hybrid'], minRemoteDays: 4 }
    };
    // Half matched (2 remote days of 4): it counts for half
    expect(scorePerfectJob(perfectJob, posting())).toMatchObject({ score: 75, broken: false });
    const onSite = posting({ location: { country: 'FR', city: 'Lyon', workMode: 'on_site' } });
    expect(scorePerfectJob(perfectJob, onSite)).toMatchObject({ score: 0, broken: true });
    // What the posting does not say counts as not matching, deal-breakers included
    const vague = posting({ location: { country: 'FR', city: 'Lyon', workMode: 'hybrid' } });
    expect(scorePerfectJob(perfectJob, vague)).toMatchObject({ score: 0, broken: true });
  });

  it('finds a job title as whole words, whatever the case and the accents', () => {
    const titles = (...keywords: string[]): PerfectJob => ({ titles: { importance: 3, keywords } });
    expect(match(titles('backend engineer'))).toBe(1);
    expect(match(titles('Staff Engineer', 'BACKEND'))).toBe(1);
    expect(match(titles('Engineer Backend'))).toBe(0);
    expect(match(titles('CTO'), posting({ title: 'Director of Engineering' }))).toBe(0);
    expect(match(titles('developpeur'), posting({ title: 'Développeur·se C++ / Node.js' }))).toBe(1);
    expect(match(titles('c++'), posting({ title: 'Développeur C++' }))).toBe(1);
    expect(match(titles('c'), posting({ title: 'Développeur C++' }))).toBe(0);
    expect(match(titles('---'))).toBe(0);
  });

  it('matches the seniority, the management and the travel the posting states', () => {
    const seniority: PerfectJob = { seniority: { importance: 3, levels: ['senior', 'lead'] } };
    expect(match(seniority)).toBe('not stated');
    expect(match(seniority, posting({ requirements: { seniority: 'lead' } }))).toBe(1);
    expect(match(seniority, posting({ requirements: { seniority: 'mid' } }))).toBe(0);

    const manager: PerfectJob = { management: { importance: 3, role: 'manager' } };
    const contributor: PerfectJob = { management: { importance: 3, role: 'contributor' } };
    expect(match(manager)).toBe('not stated');
    expect(match(manager, posting({ organization: { peers: 4 } }))).toBe('not stated');
    expect(match(manager, posting({ organization: { directReports: 3 } }))).toBe(1);
    expect(match(manager, posting({ organization: { directReports: 0 } }))).toBe(0);
    expect(match(contributor, posting({ organization: { directReports: 0 } }))).toBe(1);
    expect(match(contributor, posting({ organization: { directReports: 3 } }))).toBe(0);

    const travel: PerfectJob = { travel: { importance: 3, max: 'occasional' } };
    expect(match(travel)).toBe('not stated');
    expect(match(travel, posting({ travel: 'none' }))).toBe(1);
    expect(match(travel, posting({ travel: 'occasional' }))).toBe(1);
    expect(match(travel, posting({ travel: 'frequent' }))).toBe(0);
  });

  it('matches the work mode, and the remote days of a hybrid job', () => {
    const location = (fields: Partial<ScoredJob['location']>) =>
      posting({ location: { country: 'FR', city: 'Lyon', workMode: 'hybrid', ...fields } });
    const modes: PerfectJob = { workMode: { importance: 3, modes: ['hybrid', 'remote'] } };
    expect(match(modes, location({}))).toBe(1);
    expect(match(modes, location({ workMode: 'on_site' }))).toBe(0);

    const days: PerfectJob = { workMode: { importance: 3, modes: ['hybrid', 'remote'], minRemoteDays: 3 } };
    expect(match(days, location({ remoteDaysPerWeek: 3 }))).toBe(1);
    expect(match(days, location({ remoteDaysPerWeek: 4 }))).toBe(1);
    expect(match(days, location({ remoteDaysPerWeek: 1 }))).toBeCloseTo(1 / 3);
    expect(match(days, location({}))).toBe('not stated');
    expect(match(days, location({ workMode: 'remote' }))).toBe(1);
    expect(match(days, location({ workMode: 'on_site' }))).toBe(0);
  });

  it('matches a city by name or by the start of its postal code, and any fully remote job', () => {
    const cities = (...places: string[]): PerfectJob => ({ cities: { importance: 3, places } });
    expect(match(cities('lyon'))).toBe(1);
    expect(match(cities('Paris', 'Villeurbanne'))).toBe(0);
    expect(match(cities('69'))).toBe(1);
    expect(match(cities('75', '6900'))).toBe(1);
    expect(match(cities('75'))).toBe(0);
    expect(match(cities('Paris'), posting({ location: { country: 'FR', city: 'Paris 9e', workMode: 'on_site' } }))).toBe(1);
    expect(match(cities('Saint-Étienne'), posting({ location: { country: 'FR', city: 'saint etienne', workMode: 'on_site' } }))).toBe(1);
    expect(match(cities('Lyon'), posting({ location: { country: 'FR', city: 'Lyonnaise', workMode: 'on_site' } }))).toBe(0);
    // No postal code in the posting: only the name can match
    expect(match(cities('69'), posting({ location: { country: 'FR', city: 'Lyon', workMode: 'on_site' } }))).toBe(0);
    expect(match(cities('Paris'), posting({ location: { country: 'FR', workMode: 'remote' } }))).toBe(1);
  });

  it('matches the contract and the working time', () => {
    const contracts: PerfectJob = { contractTypes: { importance: 3, types: ['cdi', 'freelance'] } };
    expect(match(contracts)).toBe(1);
    expect(match(contracts, posting({ contract: { type: 'cdd', durationMonths: 6 } }))).toBe(0);

    const hours: PerfectJob = { workingTime: { importance: 3, arrangements: ['weekly_hours'], maxHoursPerWeek: 35 } };
    const weekly = (hoursPerWeek?: number) => posting({ workingTime: { arrangement: 'weekly_hours', hoursPerWeek } });
    expect(match(hours, weekly(35))).toBe(1);
    expect(match(hours, weekly(28))).toBe(1);
    expect(match(hours, weekly(39))).toBe(0.5);
    expect(match(hours, weekly(43))).toBe(0);
    expect(match(hours, weekly(48))).toBe(0);
    expect(match(hours, weekly())).toBe('not stated');
    const forfait = posting({ workingTime: { arrangement: 'annual_days', daysPerYear: 218 } });
    expect(match(hours, forfait)).toBe(0);
    expect(match({ workingTime: { importance: 3, arrangements: ['weekly_hours', 'annual_days'], maxHoursPerWeek: 35 } }, forfait)).toBe(1);

    const rtt: PerfectJob = { rttDays: { importance: 3, min: 10 } };
    expect(match(rtt)).toBe('not stated');
    expect(match(rtt, posting({ workingTime: { arrangement: 'annual_days', daysPerYear: 218, rttDaysPerYear: 12 } }))).toBe(1);
    expect(match(rtt, posting({ workingTime: { arrangement: 'annual_days', daysPerYear: 218, rttDaysPerYear: 5 } }))).toBe(0.5);
    expect(match(rtt, posting({ workingTime: { arrangement: 'annual_days', daysPerYear: 218, rttDaysPerYear: 0 } }))).toBe(0);
  });

  it('compares the middle of the pay range to the pay asked, down to 20% under it', () => {
    const pay = (min: number, max: number, period: ScoredJob['pay']['period'] = 'year', workingTime?: ScoredJob['workingTime']) =>
      posting({ pay: { min, max, currency: 'EUR', period }, ...(workingTime ? { workingTime } : {}) });
    const perYear: PerfectJob = { pay: { importance: 3, perYear: 60000 } };
    expect(match(perYear, pay(60000, 60000))).toBe(1);
    expect(match(perYear, pay(50000, 70000))).toBe(1);
    expect(match(perYear, pay(80000, 90000))).toBe(1);
    // 10% under: half; 20% under or more: nothing
    expect(match(perYear, pay(54000, 54000))).toBeCloseTo(0.5);
    expect(match(perYear, pay(48000, 48000))).toBeCloseTo(0);
    expect(match(perYear, pay(30000, 40000))).toBe(0);
    // Other periods, over a year: 12 months, 218 days (or the posting's own), 35 hours a week (or the posting's)
    expect(match(perYear, pay(5000, 5000, 'month'))).toBe(1);
    expect(match(perYear, pay(4500, 4500, 'month'))).toBeCloseTo(0.5);
    expect(match(perYear, pay(300, 300, 'day'))).toBe(1);
    expect(match(perYear, pay(300, 300, 'day', { arrangement: 'annual_days', daysPerYear: 180 }))).toBeCloseTo(0.5);
    expect(match(perYear, pay(33, 33, 'hour'))).toBeCloseTo(1);
    expect(match(perYear, pay(33, 33, 'hour', { arrangement: 'weekly_hours', hoursPerWeek: 28 }))).toBeCloseTo(0.004, 2);

    // A day rate asked: day rates are compared to it, salaries to the year's
    const both: PerfectJob = { pay: { importance: 3, perYear: 60000, perDay: 600 } };
    expect(match(both, pay(300, 300, 'day'))).toBe(0);
    expect(match(both, pay(540, 540, 'day'))).toBeCloseTo(0.5);
    expect(match(both, pay(60000, 60000))).toBe(1);
    // Only a day rate asked: a salary is converted to a day
    const perDay: PerfectJob = { pay: { importance: 3, perDay: 500 } };
    expect(match(perDay, pay(500, 500, 'day'))).toBe(1);
    expect(match(perDay, pay(109000, 109000))).toBe(1);
    expect(match(perDay, pay(60000, 60000))).toBe(0);
  });

  it('weighs the commute over a week: the way there and back, for each day at the office', () => {
    const commute: PerfectJob = { commute: { importance: 3, from: 'Lyon', modes: ['bike'], maxMinutesPerWeek: 300 } };
    const at = (location: Partial<ScoredJob['location']>, minutes?: number) => {
      const job = posting({ location: { country: 'FR', city: 'Lyon', workMode: 'on_site', ...location } });
      const { criteria, score } = scorePerfectJob(commute, job, minutes === undefined ? {} : { commute: { minutes } });
      return criteria[0].unavailable ? `unavailable (${score})` : criteria[0].stated ? criteria[0].match : 'not stated';
    };
    // On site, 5 days: 30 minutes each way is the 300 accepted
    expect(at({}, 30)).toBe(1);
    expect(at({}, 20)).toBe(1);
    // 450 a week (50% over) or more does not match at all; in between, in proportion
    expect(at({}, 45)).toBe(0);
    expect(at({}, 36)).toBeCloseTo(0.6);
    expect(at({}, Number.POSITIVE_INFINITY)).toBe(0);
    // Fewer days at the office, a longer way: once a week, 150 minutes each way
    expect(at({ workMode: 'hybrid', remoteDaysPerWeek: 4 }, 150)).toBe(1);
    expect(at({ workMode: 'hybrid', remoteDaysPerWeek: 2 }, 50)).toBe(1);
    expect(at({ workMode: 'hybrid', remoteDaysPerWeek: 2 }, 60)).toBeCloseTo(0.6);
    // A hybrid job that does not say: one remote day, the fewest
    expect(at({ workMode: 'hybrid' }, 37.5)).toBe(1);
    expect(officeDaysPerWeek({ country: 'FR', workMode: 'hybrid' })).toBe(4);
    expect(officeDaysPerWeek({ country: 'FR', workMode: 'on_site' })).toBe(5);
    expect(officeDaysPerWeek({ country: 'FR', workMode: 'remote' })).toBe(0);
    // No office to go to: it matches, whatever is known of the way
    expect(at({ workMode: 'remote' })).toBe(1);
    expect(at({ workMode: 'remote' }, 600)).toBe(1);
    // No travel time: left out of the score, which then asks nothing
    expect(at({})).toBe('unavailable (100)');
    // The job's address is nowhere to be found: like a posting that does not say
    const lost = scorePerfectJob(commute, posting(), { commute: { located: false } });
    expect(lost.criteria[0]).toMatchObject({ match: 0, stated: false });
    expect(lost.score).toBe(0);
  });

  it('leaves a commute that could not be computed out of the weights and of the deal-breakers', () => {
    const perfectJob: PerfectJob = {
      commute: { importance: 5, dealBreaker: true, from: 'Lyon', modes: ['car'], maxMinutesPerWeek: 100 },
      contractTypes: { importance: 1, types: ['cdi'] },
      workMode: { importance: 1, modes: ['remote'] }
    };
    expect(scorePerfectJob(perfectJob, posting())).toMatchObject({ score: 50, broken: false });
    expect(scorePerfectJob(perfectJob, posting(), { commute: { minutes: 5 } })).toMatchObject({ score: 86, broken: false });
    expect(scorePerfectJob(perfectJob, posting(), { commute: { minutes: 60 } })).toMatchObject({ score: 0, broken: true });
  });

  it('scores the skills of the posting: the share that is wanted, and none that is avoided', () => {
    const skills = (...names: string[]) => posting({ requirements: { skills: names } });
    const wanted: PerfectJob = { skills: { importance: 3, names: ['TypeScript', 'Node.js', 'C++', 'PostgreSQL'] } };
    expect(match(wanted)).toBe('not stated');
    expect(match(wanted, skills('typescript', 'NodeJS'))).toBe(1);
    expect(match(wanted, skills('TypeScript', 'node js', 'Kafka', 'PHP'))).toBe(0.5);
    expect(match(wanted, skills('C', 'C#'))).toBe(0);
    expect(match(wanted, skills('c++'))).toBe(1);

    const avoided: PerfectJob = { avoidedSkills: { importance: 3, names: ['PHP', 'Cobol'] } };
    expect(match(avoided)).toBe('not stated');
    expect(match(avoided, skills('TypeScript', 'Go'))).toBe(1);
    expect(match(avoided, skills('TypeScript', 'php'))).toBe(0);
  });
});

// A candidate can only ask for what a recruiter can say: every criterion is read from fields of
// the job posting, and JOB_FIELD_CRITERIA says which. These tests keep the two sides together:
// a criterion that reads a field it does not declare, a criterion read from nothing, or a
// posting field the table forgot (that one does not compile) fails here. tests/perfectJob.test.ts
// checks that the API stores every field, the client's tests that the job editor has them.
describe('what the criteria read of a job posting (JOB_FIELD_CRITERIA)', () => {
  /** Every criterion, with every setting it can have */
  const everything: Required<PerfectJob> = {
    titles: { importance: 3, keywords: ['Engineer'] },
    seniority: { importance: 3, levels: ['senior'] },
    management: { importance: 3, role: 'manager' },
    workMode: { importance: 3, modes: ['on_site', 'hybrid'], minRemoteDays: 3 },
    cities: { importance: 3, places: ['Lyon', '75'] },
    commute: { importance: 3, from: 'Lyon', modes: ['bike'], maxMinutesPerWeek: 300 },
    contractTypes: { importance: 3, types: ['cdi'] },
    workingTime: { importance: 3, arrangements: ['weekly_hours', 'annual_days'], maxHoursPerWeek: 35 },
    rttDays: { importance: 3, min: 12 },
    pay: { importance: 3, perYear: 70000, perDay: 600 },
    skills: { importance: 3, names: ['Go'] },
    avoidedSkills: { importance: 3, names: ['PHP'] },
    travel: { importance: 3, max: 'none' }
  };

  /** `value`, noting in `reads` the path of every value read from it */
  const recording = <T extends object>(value: T, reads: Set<string>, prefix = ''): T =>
    new Proxy(value, {
      get(target, key, receiver) {
        const item: unknown = Reflect.get(target, key, receiver);
        if (typeof key !== 'string') return item;
        const path = prefix ? `${prefix}.${key}` : key;
        if (item !== null && typeof item === 'object' && !Array.isArray(item)) return recording(item, reads, path);
        reads.add(path);
        return item;
      }
    });

  /** The fields of `job` that scoring `criterion` alone reads */
  const readBy = (criterion: PerfectJobCriterion, job: JobPostingInput): string[] => {
    const reads = new Set<string>();
    const watched = recording(job, reads);
    scorePerfectJob({ [criterion]: everything[criterion] }, watched, { commute: { minutes: 30 } });
    // The commute's travel time is computed by the API, from where the posting says the office is
    if (criterion === 'commute') officeAddress(watched.location);
    return [...reads];
  };

  it('has every criterion, with every setting, in these tests', () => {
    expect(Object.keys(everything).sort()).toEqual([...PERFECT_JOB_CRITERIA].sort());
    expect(parsePerfectJob(everything)).toEqual({ criteria: everything, problems: [] });
  });

  it('reads every criterion from at least one field of the posting', () => {
    for (const criterion of PERFECT_JOB_CRITERIA) {
      expect({ criterion, fields: criterionJobFields(criterion).length > 0 }).toEqual({ criterion, fields: true });
    }
    // And names no criterion that is not one
    const named = new Set(Object.values(JOB_FIELD_CRITERIA).flat());
    expect([...named].sort()).toEqual([...PERFECT_JOB_CRITERIA].sort());
  });

  it('scores each criterion from the fields declared for it, all of them and no other', () => {
    for (const criterion of PERFECT_JOB_CRITERIA) {
      const read = new Set(COMPLETE_POSTINGS.flatMap((job) => readBy(criterion, job)));
      expect({ criterion, read: [...read].sort() }).toEqual({
        criterion,
        read: [...criterionJobFields(criterion)].sort()
      });
    }
  });

  it('can be told everything by a posting: its complete postings are valid, and state every field', () => {
    const stated = new Set<string>();
    for (const job of COMPLETE_POSTINGS) {
      const normalised = normalizeJobPosting(job);
      expect(validateJobPosting(normalised)).toEqual([]);
      for (const path of fieldPaths(normalised)) stated.add(path);
    }
    expect([...stated].sort()).toEqual([...JOB_FIELD_PATHS].sort());
  });

  it('matches every criterion with a posting that states what it asks for', () => {
    const perfectJob: PerfectJob = {
      ...everything,
      workMode: { importance: 3, modes: ['hybrid'], minRemoteDays: 2 },
      contractTypes: { importance: 3, types: ['cdd'] },
      workingTime: { importance: 3, arrangements: ['weekly_hours'], maxHoursPerWeek: 37 },
      rttDays: { importance: 3, min: 10 },
      pay: { importance: 3, perYear: 60000 },
      skills: { importance: 3, names: ['Go', 'TypeScript'] },
      travel: { importance: 3, max: 'occasional' }
    };
    const { score, criteria } = scorePerfectJob(perfectJob, COMPLETE_POSTINGS[0], { commute: { minutes: 20 } });
    expect(criteria.filter((entry) => entry.match < 1 || !entry.stated).map((entry) => entry.criterion)).toEqual([]);
    expect(score).toBe(100);
    // The paths are the posting's own: a typo in the table would not compile
    const path: JobFieldPath = 'location.address';
    expect(JOB_FIELD_CRITERIA[path]).toEqual(['commute']);
  });
});
