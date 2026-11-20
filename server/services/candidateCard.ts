import { Types } from 'mongoose';
import {
  ExperienceType,
  cardIdentityNames,
  cardOutcomeCriteria,
  cardTextIdentifies,
  cleanHeadline,
  experiencePeriod,
  monthCount,
  monthIndex,
  normalizeSkill,
  parseDiscoveryCard,
  professionalMonths,
  ratedCriteria,
  skillDisplayName,
  skillUsesByKey,
  sortExperiences,
  MATCHING_LIMITS
} from 'portfolio-common';
import type { PerfectJobCriterion } from 'portfolio-common';
import { env } from '../env';
import { DiscoveryProfile, Domain, User } from '../models/database';
import { perfectJobOf } from './perfectJobs';
import { ownerJourney } from './workflows';
import type { JobMatchCriterionView, JobMatchOutcome } from './workflowSteps/jobMatch';

// The anonymous card of a candidate (Path 2, matching, behind MATCHING): what
// a recruiter reads of them before both sides are interested, and what the
// candidate previews (GET /discovery/card). Built here, on the server, only
// from what may be shown, as the discovery consent words it
// (legalMessages.discoveryConsent): the headline the candidate wrote, their
// professional role titles with the months spent in each, their months of
// professional experience in all, their skills with the months they used
// each. Never their name, their portfolio's title or address, their email, a
// company, a place, a project's name or summary, a date, an id, their
// perfect job, a score or a travel time: none of it is even loaded, but the
// names the card's texts are checked against.
//
// The months are counted as the candidate's experiences page counts them
// (portfolio-common's experienceMonths.ts): a skill's months are the
// skillMonths of the projects using it. An experience the candidate hides
// from the card counts for nothing on it: not its role, not its months, not
// its projects' skills. A text that says who the candidate is (their name,
// their portfolio, a company or a place of their experiences, a link, an
// email address or a phone number: cardTextIdentifies) is left out: a role
// with such a title, a skill with such a name, a headline that came to name
// them since it was saved; the preview tells the candidate which, to change.
//
// Deterministic, as everything in matching: no model is asked anything.

/** A professional role on the card */
export interface CandidateCardRole {
  /** Its title, as the candidate wrote it (on one line, nothing invisible) */
  title: string;
  /**
   * The months spent in it, both ends included, up to the current month; null
   * for a role without dates (none of its own, none of its projects')
   */
  months: number | null;
  /** Held now: ongoing, or ending this month or later */
  current: boolean;
}

/** A skill on the card */
export interface CandidateCardSkill {
  /** Its name in the site's catalogue of skills */
  name: string;
  /**
   * The months it was used: the calendar months of the projects using it,
   * each counted once, up to the current month (portfolio-common skillMonths)
   */
  months: number;
}

/** What a recruiter reads of a candidate before both sides are interested */
export interface CandidateCard {
  /** The line the candidate wrote atop it; null without one */
  headline: string | null;
  /**
   * Months of professional experience in all, each month counted once
   * (portfolio-common professionalMonths), up to the current month
   */
  experienceMonths: number;
  /**
   * The professional roles, the most recent first (as the experiences page
   * orders them), MATCHING_LIMITS.roles at most
   */
  roles: CandidateCardRole[];
  /**
   * The technical skills, the most used first (by months, then by projects),
   * MATCHING_LIMITS.skills at most
   */
  skills: CandidateCardSkill[];
}

/**
 * Why a professional experience is not a role of the card: hidden by the
 * candidate; its title says who they are (cardTextIdentifies); it has not
 * started yet; beyond the MATCHING_LIMITS.roles most recent
 */
export type CardRoleWithheld = 'hidden' | 'title' | 'upcoming' | 'limit';

/** What the card leaves out of what the candidate set, and why: for them to change */
export interface CardWithheld {
  /** The headline they saved says who they are now (a name, a company... set since): not shown */
  headline: boolean;
  /** Each professional experience of their portfolio that is not a role of the card */
  roles: { experience: string; reason: CardRoleWithheld }[];
  /** The skills whose name says who they are (cardTextIdentifies): not shown */
  skills: string[];
}

/** A candidate's card, and what it leaves out of what they set */
export interface BuiltCard {
  card: CandidateCard;
  withheld: CardWithheld;
}

/** GET /discovery/card: the candidate's anonymous card, as recruiters read it, and what it leaves out */
export interface CandidateCardPreview {
  card: CandidateCard;
  /**
   * The criteria, of those the candidate rates, whose outcome a recruiter
   * reads beside the card for their job: none unless the job match of their
   * journey shows details, never the commute or the places
   * (portfolio-common's cardOutcomeCriteria)
   */
  outcomes: PerfectJobCriterion[];
  withheld: CardWithheld;
}

/** How a recruiter's job does on a criterion, as the card shows it beside itself */
export interface CardOutcome {
  criterion: PerfectJobCriterion;
  outcome: JobMatchOutcome;
  /** The job does not say what the criterion reads */
  notStated?: true;
}

/**
 * The outcomes of a recruiter's job on the candidate's criteria (the job match
 * step's views) as the candidate's card may show them: none unless their
 * journey's job match shows details (`showDetails`), never the commute or the
 * places (portfolio-common's cardOutcomeCriteria), and never whether a
 * criterion is a deal-breaker (a job that misses one scores 0, and reaches no
 * feed). For the feeds: a recruiter reads them beside the card
 */
export const cardOutcomes = (views: readonly JobMatchCriterionView[], showDetails: boolean): CardOutcome[] => {
  const shown = new Set(cardOutcomeCriteria(views.map((view) => view.criterion), showDetails));
  return views
    .filter((view) => shown.has(view.criterion))
    .map(({ criterion, outcome, notStated }) => ({ criterion, outcome, ...(notStated ? { notStated } : {}) }));
};

// --- What the card is built from ------------------------------------------------------

type StoredSkill = { skill?: unknown };

/** A project as the card loads it: its months and its skills, never its name or summary */
interface CardProject {
  start?: Date | null;
  end?: Date | null;
  hardSkills?: StoredSkill[] | null;
  softSkills?: StoredSkill[] | null;
}

/** An experience as the card loads it */
export interface CardExperience {
  _id: Types.ObjectId | string;
  type?: ExperienceType | null;
  title?: string | null;
  start?: Date | null;
  end?: Date | null;
  projects?: CardProject[] | null;
  /** Only to check the card's texts against: never shown */
  company?: { name?: string | null } | null;
  /** Only to check the card's texts against: never shown */
  location?: string | null;
}

/** What the card of a candidate is built from (loadCard) */
export interface CardSource {
  /** The headline they saved */
  headline: string | null;
  /** The ids of the experiences they hide from the card */
  hidden: ReadonlySet<string>;
  /** Their portfolio's experiences */
  experiences: readonly CardExperience[];
  /** What says who they are (candidateIdentity) */
  identity: CandidateIdentity;
}

/** What says who a candidate is, which their card's texts are checked against */
export interface CandidateIdentity {
  /** cardIdentityNames: their name, their portfolio's title and address name, their companies and places */
  names: string[];
  /** The hosts of the site's pages, where their portfolio is (`<host>/` in a text is a link to it) */
  hosts: string[];
}

/** The hosts of the site's web pages (ALLOWED_DOMAINS), lower case: where portfolios are */
const siteHosts = (): string[] =>
  env.ALLOWED_DOMAINS.flatMap((origin) => {
    try {
      return [new URL(origin).host.toLowerCase()];
    } catch {
      return [];
    }
  });

/**
 * Whether `text`, which the card would show, says who the candidate of
 * `identity` is: cardTextIdentifies, or a page of the site (`<host>/`)
 */
export const identifiesCandidate = (text: string, identity: CandidateIdentity): boolean => {
  if (cardTextIdentifies(text, identity.names)) return true;
  const lower = cleanHeadline(text).toLowerCase();
  return identity.hosts.some((host) => lower.includes(`${host}/`));
};

const identityOf = (
  user: { name?: string | null; surname?: string | null } | null,
  domain: { name?: string | null; headerTitle?: string | null } | null,
  experiences: readonly Pick<CardExperience, 'company' | 'location'>[]
): CandidateIdentity => ({
  names: cardIdentityNames({
    person: [user?.name, user?.surname].filter(Boolean).join(' '),
    portfolio: [domain?.headerTitle, domain?.name],
    companies: experiences.map((experience) => experience.company?.name),
    places: experiences.map((experience) => experience.location)
  }),
  hosts: siteHosts()
});

const userName = (userId: string) =>
  User.findById(userId, { name: 1, surname: 1 }).lean<{ name?: string; surname?: string }>();

/**
 * What says who the account `userId` is (its name, its portfolio's title and
 * address name, the companies and places of its experiences), which its card's
 * texts are checked against: PUT /discovery refuses a headline that names it
 */
export async function candidateIdentity(userId: string): Promise<CandidateIdentity> {
  const [user, domain] = await Promise.all([
    userName(userId),
    Domain.findOne({ admin: userId }, { name: 1, headerTitle: 1, experiences: 1 })
      .populate<{ experiences: Pick<CardExperience, 'company' | 'location'>[] }>({
        path: 'experiences',
        select: { 'company.name': 1, location: 1 }
      })
      .lean()
  ]);
  return identityOf(user, domain, domain?.experiences ?? []);
}

/** What the card of the account `userId` is built from: its profile's card settings, its portfolio, its name */
async function loadCard(userId: string): Promise<CardSource> {
  const [profile, user, domain] = await Promise.all([
    DiscoveryProfile.findOne({ user: userId }, { card: 1 }).lean<{
      card?: { headline?: string | null; hiddenExperiences?: Types.ObjectId[] | null } | null;
    }>(),
    userName(userId),
    Domain.findOne({ admin: userId }, { name: 1, headerTitle: 1, experiences: 1 })
      .populate<{ experiences: CardExperience[] }>({
        path: 'experiences',
        // A project's name and summary are never loaded: the card cannot show them
        select: {
          type: 1,
          title: 1,
          start: 1,
          end: 1,
          'company.name': 1,
          location: 1,
          'projects.start': 1,
          'projects.end': 1,
          'projects.hardSkills': 1,
          'projects.softSkills': 1
        },
        populate: [
          { path: 'projects.hardSkills.skill', select: { displayName: 1 } },
          { path: 'projects.softSkills.skill', select: { displayName: 1 } }
        ]
      })
      .lean()
  ]);
  const experiences = domain?.experiences ?? [];
  return {
    headline: profile?.card?.headline ?? null,
    hidden: new Set((profile?.card?.hiddenExperiences ?? []).map(String)),
    experiences,
    identity: identityOf(user, domain, experiences)
  };
}

// --- Building it ----------------------------------------------------------------------

/**
 * The headline the card shows: the one saved, as the rules are now (it was
 * checked when saved, but what it may not name can change since: a portfolio
 * renamed, a company added), else none
 */
const shownHeadline = (headline: string | null, identity: CandidateIdentity): string | null => {
  if (!headline) return null;
  const parsed = parseDiscoveryCard({ headline });
  if (!parsed.ok || !parsed.card.headline) return null;
  return identifiesCandidate(parsed.card.headline, identity) ? null : parsed.card.headline;
};

/**
 * The anonymous card of the candidate whose card is built from `source`, and
 * what it leaves out of what they set: pure, `now` the current month
 */
export function buildCandidateCard(source: CardSource, now = new Date()): BuiltCard {
  const { identity } = source;
  const nowMonth = monthIndex(now);
  const isHidden = (experience: CardExperience) => source.hidden.has(String(experience._id));
  // In the order the experiences page lists them: the most recent first
  const sorted = sortExperiences(source.experiences);
  const shown = sorted.filter((experience) => !isHidden(experience));

  const headline = shownHeadline(source.headline, identity);

  const roles: CandidateCardRole[] = [];
  const withheldRoles: CardWithheld['roles'] = [];
  for (const experience of sorted) {
    if (experience.type !== ExperienceType.Professional) continue;
    const id = String(experience._id);
    if (isHidden(experience)) {
      withheldRoles.push({ experience: id, reason: 'hidden' });
      continue;
    }
    const period = experiencePeriod(experience);
    if (period.start && monthIndex(period.start) > nowMonth) {
      withheldRoles.push({ experience: id, reason: 'upcoming' });
      continue;
    }
    const title = cleanHeadline(experience.title ?? '');
    if (!title || identifiesCandidate(title, identity)) {
      withheldRoles.push({ experience: id, reason: 'title' });
      continue;
    }
    if (roles.length >= MATCHING_LIMITS.roles) {
      withheldRoles.push({ experience: id, reason: 'limit' });
      continue;
    }
    // Spent so far: up to its end, or to the current month for one ongoing or ending later
    const endsLater = period.ongoing || !period.end || monthIndex(period.end) >= nowMonth;
    roles.push({
      title,
      months: period.start ? monthCount(period.start, endsLater ? now : period.end, now) : null,
      current: period.start !== undefined && endsLater
    });
  }

  // Every skill's months as skillMonths counts them on the experiences shown
  // (technical or soft, on the same projects as the page's skill preview);
  // the card lists the technical ones, by the first spelling met
  const uses = skillUsesByKey(shown, now);
  const technical = new Map<string, string>();
  for (const experience of shown) {
    for (const project of experience.projects ?? []) {
      for (const entry of project.hardSkills ?? []) {
        const name = skillDisplayName(entry);
        if (name === undefined) continue;
        const key = normalizeSkill(name);
        if (!technical.has(key)) technical.set(key, cleanHeadline(name));
      }
    }
  }
  const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const ranked = [...technical]
    .map(([key, name]) => ({ key, name, months: uses.get(key)?.months ?? 0, projects: uses.get(key)?.projects ?? 0 }))
    .sort((a, b) => b.months - a.months || b.projects - a.projects || byKey(a.key, b.key));
  const skills: CandidateCardSkill[] = [];
  const withheldSkills: string[] = [];
  // Two spellings the card writes alike (one with a sign that cannot be seen) are one skill: the most used
  const listed = new Set<string>();
  for (const { name, months } of ranked) {
    const key = normalizeSkill(name);
    if (!key || listed.has(key)) continue;
    listed.add(key);
    if (identifiesCandidate(name, identity)) withheldSkills.push(name);
    else if (skills.length < MATCHING_LIMITS.skills) skills.push({ name, months });
  }

  return {
    card: { headline, experienceMonths: professionalMonths(shown, now), roles, skills },
    withheld: {
      headline: source.headline !== null && source.headline !== '' && headline === null,
      roles: withheldRoles,
      skills: withheldSkills
    }
  };
}

/** The anonymous card of the account `userId`, and what it leaves out (buildCandidateCard) */
export async function candidateCard(userId: string, now = new Date()): Promise<BuiltCard> {
  return buildCandidateCard(await loadCard(userId), now);
}

/**
 * What the candidate `userId` previews of their anonymous card (GET
 * /discovery/card): the card as recruiters read it, the criteria whose
 * outcome a recruiter reads beside it for their job, and what it leaves out.
 * Reads only, on or off
 */
export async function candidateCardPreview(userId: string, now = new Date()): Promise<CandidateCardPreview> {
  const [built, journey, perfectJob] = await Promise.all([
    candidateCard(userId, now),
    ownerJourney(userId),
    perfectJobOf(userId)
  ]);
  const jobMatch = journey.steps.find((step) => step.type === 'job-match');
  const showDetails = (jobMatch?.config as { showDetails?: unknown } | undefined)?.showDetails === true;
  return {
    card: built.card,
    outcomes: cardOutcomeCriteria(ratedCriteria(perfectJob), showDetails),
    withheld: built.withheld
  };
}
