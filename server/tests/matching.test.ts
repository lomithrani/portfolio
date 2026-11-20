// The rules of matching (Path 2) in portfolio-common, shared by the API and
// the client: what a candidate must have set up (discoveryRequirements, read
// from their readiness), the consent (18 or over), its lapse, the state, the
// settings of the anonymous card; what a job needs to be in matching, its
// review, and how long matches are kept. Pure functions: no database
import { describe, expect, it } from 'bun:test';
import {
  AGE_CONFIRMATION_KEYS,
  CARD_WITHHELD_CRITERIA,
  DISCOVERY_CONSENT_KEYS,
  DISCOVERY_CONSENT_RENEWAL_DAYS,
  DISCOVERY_INACTIVITY_DAYS,
  DISCOVERY_LIMITS,
  DISCOVERY_MIN_CRITERIA,
  DISCOVERY_REQUIREMENTS,
  LEGAL_VERSION,
  MATCHING_JOB_STATUSES,
  MATCHING_LIMITS,
  MATCH_RETENTION,
  MINIMUM_AGE,
  MINIMUM_DISCOVERY_AGE,
  PERFECT_JOB_CRITERIA,
  cardIdentityNames,
  cardOutcomeCriteria,
  canonicalJobSnapshot,
  cardTextIdentifies,
  cleanHeadline,
  currentDiscoveryConsent,
  discoveryConsentCutoff,
  discoveryConsentExpiry,
  discoveryConsentKey,
  discoveryConsentRenewable,
  discoveryInactive,
  discoveryRenewalCutoff,
  discoveryRequirementMessage,
  discoveryRequirements,
  discoveryState,
  emailDomainOf,
  endedMatchExpiry,
  headlineNames,
  jobLiveInMatching,
  keepsMatching,
  matchDecisionExpiry,
  matchingJobProblem,
  legalMessages,
  parseDiscoveryCard,
  parseDiscoveryConsent,
  parseReviewReason,
  withLocale
} from 'portfolio-common';
import type { CandidateReadiness, DiscoveryRequirement } from 'portfolio-common';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-20T10:00:00Z');

/** A candidate who has set up everything discovery asks for */
const READY: CandidateReadiness = {
  domain: 'jane',
  experiences: 2,
  perfectJob: { criteria: 3, essentials: { pay: true, workMode: true, place: false, contractTypes: true } },
  journey: { saved: true, types: ['note', 'job', 'job-match', 'meeting'], blocked: false, gate: true, meeting: true },
  calendar: { configured: true, connected: true, reconnect: false, enabledSchedules: 1 }
};

/** What a new account has: nothing set up, the default journey */
const NOTHING: CandidateReadiness = {
  domain: null,
  experiences: 0,
  perfectJob: { criteria: 0, essentials: { pay: false, workMode: false, place: false, contractTypes: false } },
  journey: { saved: false, types: ['meeting'], blocked: false, gate: false, meeting: true },
  calendar: { configured: true, connected: false, reconnect: false, enabledSchedules: 0 }
};

const ready = { termsAccepted: true, now: NOW };

/**
 * The exact wording each key of DISCOVERY_CONSENT_KEYS stands for. A consent recorded under a key
 * is the proof of what the candidate ticked (GDPR art. 7(1)): a wording changes only with a new key,
 * here and in common/models/legal.ts together, never under a key already recorded
 */
const DISCOVERY_CONSENT_WORDINGS: Record<string, string> = {
  'discovery-18-v1':
    'I confirm that I am at least 18 years old. I want Portfolio to show me the open jobs that meet my criteria, and to propose my anonymous card to their recruiters. My card shows the headline I write, my role titles and the time spent in each, and my skills and how long I used each. If my page for recruiters shows them how their job does on each of my criteria, my card shows it too, except for my commute and where I want to work. A recruiter sees my name and my portfolio only once we are both interested. I can turn this off at any time.',
  'discovery-18-v1-fr':
    "Je confirme avoir au moins 18 ans. Je souhaite que Portfolio me montre les offres ouvertes qui répondent à mes critères et propose ma fiche anonyme à leurs recruteurs. Ma fiche montre l'accroche que j'écris, mes intitulés de poste et le temps passé à chacun, ainsi que mes compétences et leur durée d'utilisation. Si ma page recruteurs leur montre le résultat de leur offre sur chacun de mes critères, ma fiche le montre aussi, sauf pour mon trajet et le lieu où je veux travailler. Un recruteur ne voit mon nom et mon portfolio qu'en cas d'intérêt réciproque. Je peux désactiver cela à tout moment.",
  // Every field of the card: v1 named neither the total time of professional experience nor whether a role is held now
  'discovery-18-v2':
    'I confirm that I am at least 18 years old. I want Portfolio to show me the open jobs that meet my criteria, and to propose my anonymous card to their recruiters. My card shows the headline I write, my role titles with the time spent in each and whether I still hold it, my total time of professional experience, and my skills with how long I used each. If my page for recruiters shows them how their job does on each of my criteria, my card shows it too, except for my commute and where I want to work. A recruiter sees my name and my portfolio only once we are both interested. I can turn this off at any time.',
  'discovery-18-v2-fr':
    "Je confirme avoir au moins 18 ans. Je souhaite que Portfolio me montre les offres ouvertes qui répondent à mes critères et propose ma fiche anonyme à leurs recruteurs. Ma fiche montre l'accroche que j'écris, mes intitulés de poste avec le temps passé à chacun et si je l'occupe encore, ma durée totale d'expérience professionnelle, ainsi que mes compétences et leur durée d'utilisation. Si ma page recruteurs leur montre le résultat de leur offre sur chacun de mes critères, ma fiche le montre aussi, sauf pour mon trajet et le lieu où je veux travailler. Un recruteur ne voit mon nom et mon portfolio qu'en cas d'intérêt réciproque. Je peux désactiver cela à tout moment."
};

describe('discoveryRequirements', () => {
  it('asks nothing more of a candidate who has set everything up', () => {
    expect(discoveryRequirements(READY, ready)).toEqual([]);
  });

  it('lists everything a new account misses, in the order they are set up', () => {
    expect(discoveryRequirements(NOTHING, { termsAccepted: false, now: NOW })).toEqual([
      'portfolio',
      'terms',
      'criteria',
      'pay',
      'journey',
      'calendar',
      'schedule'
    ]);
    expect(DISCOVERY_REQUIREMENTS).toEqual([
      'portfolio',
      'terms',
      'criteria',
      'pay',
      'journey',
      'calendar',
      'schedule',
      'active'
    ]);
  });

  it.each<[string, Partial<CandidateReadiness> | { terms: false }, DiscoveryRequirement[]]>([
    ['no portfolio', { domain: null }, ['portfolio']],
    ['the terms in force not accepted', { terms: false }, ['terms']],
    [
      `fewer than ${DISCOVERY_MIN_CRITERIA} criteria`,
      { perfectJob: { ...READY.perfectJob, criteria: DISCOVERY_MIN_CRITERIA - 1 } },
      ['criteria']
    ],
    [
      'the pay not rated',
      { perfectJob: { criteria: 4, essentials: { ...READY.perfectJob.essentials, pay: false } } },
      ['pay']
    ],
    ['a journey without the gate', { journey: { ...READY.journey, types: ['job', 'meeting'], gate: false } }, ['journey']],
    ['a blocked journey', { journey: { ...READY.journey, blocked: true, gate: false, meeting: false } }, ['journey']],
    ['the calendar not connected', { calendar: { ...READY.calendar, connected: false } }, ['calendar']],
    ['the calendar refused by Google', { calendar: { ...READY.calendar, connected: false, reconnect: true } }, ['calendar']],
    ['a site without Google Calendar', { calendar: { ...READY.calendar, configured: false } }, ['calendar']],
    ['no meeting type with hours', { calendar: { ...READY.calendar, enabledSchedules: 0 } }, ['schedule']]
  ])('asks for what is missing: %s', (_label, change, missing) => {
    const termsAccepted = !('terms' in change);
    const readiness = { ...READY, ...('terms' in change ? {} : change) } as CandidateReadiness;
    expect(discoveryRequirements(readiness, { termsAccepted, now: NOW })).toEqual(missing);
  });

  it(`pauses a candidate inactive for more than ${DISCOVERY_INACTIVITY_DAYS} days, and never one without a date`, () => {
    const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);
    expect(discoveryRequirements(READY, { ...ready, lastActiveAt: daysAgo(DISCOVERY_INACTIVITY_DAYS) })).toEqual([]);
    expect(discoveryRequirements(READY, { ...ready, lastActiveAt: daysAgo(DISCOVERY_INACTIVITY_DAYS + 1) })).toEqual([
      'active'
    ]);
    // As the API answers it: a string
    expect(
      discoveryRequirements(READY, { ...ready, lastActiveAt: daysAgo(DISCOVERY_INACTIVITY_DAYS + 1).toISOString() })
    ).toEqual(['active']);
    expect(discoveryRequirements(READY, { ...ready, lastActiveAt: undefined })).toEqual([]);
    expect(discoveryRequirements(READY, { ...ready, lastActiveAt: null })).toEqual([]);
  });

  it('counts a date that cannot be read as inactive (fails closed)', () => {
    expect(discoveryInactive('not a date', NOW)).toBe(true);
    expect(discoveryInactive(new Date(NOW.getTime() - DAY), NOW)).toBe(false);
  });

  it('says what each requirement asks, in both languages', () => {
    for (const requirement of DISCOVERY_REQUIREMENTS) {
      const en = withLocale('en', () => discoveryRequirementMessage(requirement));
      const fr = withLocale('fr', () => discoveryRequirementMessage(requirement));
      expect(en).toBeTruthy();
      expect(fr).toBeTruthy();
      expect(fr).not.toBe(en);
    }
    expect(withLocale('en', () => discoveryRequirementMessage('criteria'))).toContain(`${DISCOVERY_MIN_CRITERIA} criteria`);
    expect(withLocale('fr', () => discoveryRequirementMessage('active'))).toContain(`${DISCOVERY_INACTIVITY_DAYS}`);
  });
});

describe('the discovery consent', () => {
  it('is for adults, above the age of the terms, with a wording of its own', () => {
    expect(MINIMUM_DISCOVERY_AGE).toBe(18);
    expect(MINIMUM_DISCOVERY_AGE).toBeGreaterThan(MINIMUM_AGE);
    for (const locale of ['en', 'fr'] as const) {
      const wording = withLocale(locale, () => legalMessages.discoveryConsent);
      expect(wording).toContain(String(MINIMUM_DISCOVERY_AGE));
      expect(wording).not.toBe(withLocale(locale, () => legalMessages.ageConfirmation));
    }
    expect(DISCOVERY_CONSENT_KEYS.en).not.toBe(DISCOVERY_CONSENT_KEYS.fr);
    expect(Object.values(DISCOVERY_CONSENT_KEYS)).not.toContain(AGE_CONFIRMATION_KEYS.en);
    expect(withLocale('fr', discoveryConsentKey)).toBe(DISCOVERY_CONSENT_KEYS.fr);
    expect(withLocale('en', discoveryConsentKey)).toBe(DISCOVERY_CONSENT_KEYS.en);
  });

  it('keeps each key to the exact wording it stands for: a new wording needs a new key', () => {
    for (const locale of ['en', 'fr'] as const) {
      const key = DISCOVERY_CONSENT_KEYS[locale];
      expect(DISCOVERY_CONSENT_WORDINGS[key]).toBeDefined();
      expect(withLocale(locale, () => legalMessages.discoveryConsent)).toBe(DISCOVERY_CONSENT_WORDINGS[key]);
    }
  });

  it('names every field of the anonymous card, in both languages', () => {
    // The card (services/candidateCard.ts, CANDIDATE_CARD_FIELDS, which tests/discovery.test.ts pins) is
    // { headline, experienceMonths, roles: { title, months, current }, skills: { name, months } }
    const en = withLocale('en', () => legalMessages.discoveryConsent);
    for (const field of [
      'the headline I write',
      'my total time of professional experience',
      'my role titles with the time spent in each',
      'whether I still hold it',
      'my skills with how long I used each'
    ]) {
      expect(en).toContain(field);
    }
    const fr = withLocale('fr', () => legalMessages.discoveryConsent);
    for (const field of [
      "l'accroche que j'écris",
      "ma durée totale d'expérience professionnelle",
      'mes intitulés de poste avec le temps passé à chacun',
      "si je l'occupe encore",
      "mes compétences et leur durée d'utilisation"
    ]) {
      expect(fr).toContain(field);
    }
  });

  it('accepts the confirmation of the terms in force, and keeps only its two fields', () => {
    expect(parseDiscoveryConsent({ ...currentDiscoveryConsent(), extra: 'kept?' })).toEqual({
      ok: true,
      consent: { termsVersion: LEGAL_VERSION, adultConfirmed: true }
    });
  });

  it.each([
    ['nothing', undefined, 'consent'],
    ['a list', [], 'consent'],
    ['a string', 'yes', 'consent'],
    ['the box not ticked', { termsVersion: LEGAL_VERSION, adultConfirmed: false }, 'consent.adultConfirmed'],
    ['a truthy value that is not true', { termsVersion: LEGAL_VERSION, adultConfirmed: 'true' }, 'consent.adultConfirmed'],
    ['the terms confirmation instead', { termsVersion: LEGAL_VERSION, ageConfirmed: true }, 'consent.adultConfirmed'],
    ['an older version of the terms', { termsVersion: '2020-01-01', adultConfirmed: true }, 'consent.termsVersion'],
    ['no version', { adultConfirmed: true }, 'consent.termsVersion']
  ])('refuses %s', (_label, input, property) => {
    const result = parseDiscoveryConsent(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.property).toBe(property as never);
      expect(result.message).toBeTruthy();
    }
  });

  it('lapses 24 months after it was given', () => {
    expect(discoveryConsentExpiry(new Date('2026-11-20T10:00:00Z'))).toEqual(new Date('2028-11-20T10:00:00Z'));
    expect(discoveryConsentCutoff(new Date('2028-11-20T10:00:00Z'))).toEqual(new Date('2026-11-20T10:00:00Z'));
  });

  it(`can be confirmed again in its last ${DISCOVERY_CONSENT_RENEWAL_DAYS} days, or once lapsed, not before`, () => {
    const given = new Date('2026-11-20T10:00:00Z');
    const expiry = discoveryConsentExpiry(given);
    const daysBefore = (days: number) => new Date(expiry.getTime() - days * DAY);
    expect(discoveryConsentRenewable(given, daysBefore(DISCOVERY_CONSENT_RENEWAL_DAYS + 1))).toBe(false);
    expect(discoveryConsentRenewable(given, daysBefore(DISCOVERY_CONSENT_RENEWAL_DAYS))).toBe(true);
    expect(discoveryConsentRenewable(given.toISOString(), daysBefore(1))).toBe(true);
    expect(discoveryConsentRenewable(given, new Date(expiry.getTime() + DAY))).toBe(true);
    // Off: a consent is given, not confirmed again; a date that cannot be read is not one
    expect(discoveryConsentRenewable(null, NOW)).toBe(false);
    expect(discoveryConsentRenewable('not a date', NOW)).toBe(false);
    expect(discoveryRenewalCutoff(daysBefore(DISCOVERY_CONSENT_RENEWAL_DAYS))).toEqual(given);
  });
});

describe('discoveryState', () => {
  it('is off without a consent, on with one and nothing missing, paused when something is', () => {
    expect(discoveryState(undefined, [], NOW)).toBe('off');
    expect(discoveryState(null, ['calendar'], NOW)).toBe('off');
    expect(discoveryState(new Date(NOW.getTime() - DAY), [], NOW)).toBe('on');
    expect(discoveryState(new Date(NOW.getTime() - DAY), ['calendar'], NOW)).toBe('paused');
    expect(discoveryState(new Date(NOW.getTime() - DAY).toISOString(), ['active'], NOW)).toBe('paused');
  });

  it('is lapsed once the consent is 24 months old, whatever is missing', () => {
    const given = new Date('2024-11-20T10:00:00Z');
    expect(discoveryState(given, [], new Date('2026-11-20T09:59:59Z'))).toBe('on');
    expect(discoveryState(given, [], new Date('2026-11-20T10:00:00Z'))).toBe('lapsed');
    expect(discoveryState(given, ['calendar'], new Date('2027-01-01T00:00:00Z'))).toBe('lapsed');
  });
});

describe('parseDiscoveryCard', () => {
  const id = (n: number) => n.toString(16).padStart(24, 'a');

  it('keeps a headline on one line, without what cannot be seen, and the hidden experiences once each', () => {
    const result = parseDiscoveryCard({
      headline: '  Backend​ engineer,\n\tpayments  ',
      hiddenExperiences: [id(1), id(1).toUpperCase(), id(2)]
    });
    expect(result).toEqual({
      ok: true,
      card: { headline: 'Backend engineer, payments', hiddenExperiences: [id(1), id(2)] }
    });
  });

  it('reads no headline, an empty one or one of spaces as none, and no list as an empty one', () => {
    expect(parseDiscoveryCard({})).toEqual({ ok: true, card: { headline: null, hiddenExperiences: [] } });
    expect(parseDiscoveryCard({ headline: null, hiddenExperiences: null })).toEqual({
      ok: true,
      card: { headline: null, hiddenExperiences: [] }
    });
    expect(parseDiscoveryCard({ headline: ' ​ ' })).toEqual({ ok: true, card: { headline: null, hiddenExperiences: [] } });
  });

  it(`takes a headline of ${DISCOVERY_LIMITS.headline} characters at most, counted once cleaned`, () => {
    const longest = 'a'.repeat(DISCOVERY_LIMITS.headline);
    expect(parseDiscoveryCard({ headline: `${longest}​​` }).ok).toBe(true);
    const result = parseDiscoveryCard({ headline: `${longest}b` });
    expect(result).toMatchObject({ ok: false, property: 'card.headline' });
  });

  it.each([
    'Backend engineer, see https://jane.dev',
    'Reach me at www.jane.dev',
    'jane.doe@example.com for a call',
    'ftp://files.example.com',
    // A host followed by a path
    'linkedin.com/in/jane-doe',
    'Backend, github.com/jane',
    'portfolio.gentil.tech/jane-doe',
    'Designer, behance.net/zoe',
    'jane.net/cv',
    'Talks at slideshare.net/jane',
    'Backend, see zoe.net/about',
    // A host alone, under a domain people take for their own pages
    'Backend engineer, zoemarchetti.dev',
    'jane-doe.com',
    'Lead dev, zoe.marchetti.fr.',
    // Only a technology standing alone is no host: an email address on such a domain stays one
    'jane@asp.net',
    // A phone number
    'Call 06 12 34 56 78',
    'Backend +33 6 12 34 56 78',
    '0612345678 any time',
    // Look-alike signs, folded by NFKC
    'jane＠acme.fr',
    'https：／／jane.dev',
    'ｗｗｗ．jane.dev'
  ])('refuses a way to reach the candidate in the headline: %p', (headline) => {
    expect(parseDiscoveryCard({ headline })).toMatchObject({ ok: false, property: 'card.headline' });
  });

  it.each([
    'Lead dev @ fintech, 10 years',
    'Node.js, ASP.NET and Vue.js',
    'Node.js/React developer',
    'Next.js/TypeScript',
    'ASP.NET/Azure developer',
    'asp.net/vb.net and ADO.NET',
    'ML.NET, Akka.NET and C#/.NET',
    'Socket.IO and Express.js',
    'CI/CD, 2015-2024',
    'Java 8, 11, 17 and 21',
    '10 years, 3 teams of 12'
  ])('keeps a headline that reaches nobody: %p', (headline) => {
    expect(parseDiscoveryCard({ headline })).toMatchObject({ ok: true, card: { headline } });
  });

  it('keeps a headline folded by NFKC: what looks like a letter is that letter', () => {
    expect(parseDiscoveryCard({ headline: 'Ｂａｃｋｅｎｄ ｅｎｇｉｎｅｅｒ' })).toMatchObject({
      ok: true,
      card: { headline: 'Backend engineer' }
    });
  });

  it.each([
    ['not an object', 'headline', 'card'],
    ['a list', [], 'card'],
    ['a headline that is not text', { headline: 12 }, 'card.headline'],
    ['hidden experiences that are not a list', { hiddenExperiences: 'abc' }, 'card.hiddenExperiences'],
    ['an id that is not one', { hiddenExperiences: ['not-an-id'] }, 'card.hiddenExperiences'],
    ['an id that is not text', { hiddenExperiences: [12] }, 'card.hiddenExperiences'],
    [
      `more than ${DISCOVERY_LIMITS.hiddenExperiences} experiences`,
      { hiddenExperiences: Array.from({ length: DISCOVERY_LIMITS.hiddenExperiences + 1 }, (_, n) => id(n)) },
      'card.hiddenExperiences'
    ]
  ])('refuses %s', (_label, input, property) => {
    expect(parseDiscoveryCard(input)).toMatchObject({ ok: false, property });
  });

  it('cleans a headline as it is kept', () => {
    expect(cleanHeadline(' a‮b \n c ')).toBe('ab c');
  });
});

describe('headlineNames', () => {
  it('finds a name whole, whatever its case, accents or spacing', () => {
    expect(headlineNames('Backend engineer, Léa  Dupont', ['Lea Dupont'])).toBe(true);
    expect(headlineNames('LOUIS.GENTIL — backend', [null, undefined, 'louis.gentil'])).toBe(true);
    expect(headlineNames('louis.gentil', ['louis.gentil'])).toBe(true);
    expect(headlineNames('Backend (jane)', ['Jane'])).toBe(true);
  });

  it('finds no name inside another word, nor one too short to be a name', () => {
    expect(headlineNames('Senior developer', ['dev'])).toBe(false);
    expect(headlineNames('Janet, backend', ['Jane'])).toBe(false);
    expect(headlineNames('A Go engineer', ['a', 'go', ' '])).toBe(false);
    expect(headlineNames('Backend engineer', [])).toBe(false);
  });

  it('reads a name as text, never as a pattern', () => {
    expect(headlineNames('Backend engineer', ['.*'])).toBe(false);
    expect(headlineNames('Backend a.b engineer', ['a.b'])).toBe(true);
    expect(headlineNames('Backend axb engineer', ['a.b'])).toBe(false);
  });
});

describe('cardOutcomeCriteria', () => {
  it("shows no job's outcome unless the journey's job match shows details", () => {
    expect(cardOutcomeCriteria([...PERFECT_JOB_CRITERIA], false)).toEqual([]);
  });

  it('never shows the commute or the places, and keeps the order of the criteria rated', () => {
    expect(CARD_WITHHELD_CRITERIA).toEqual(['commute', 'cities']);
    expect(cardOutcomeCriteria([...PERFECT_JOB_CRITERIA], true)).toEqual(
      PERFECT_JOB_CRITERIA.filter((criterion) => criterion !== 'commute' && criterion !== 'cities')
    );
    expect(cardOutcomeCriteria(['pay', 'commute', 'workMode', 'cities'], true)).toEqual(['pay', 'workMode']);
  });
});

describe('cardIdentityNames', () => {
  it('names the candidate, their portfolio, their companies (also without a legal form) and their places (also each part)', () => {
    expect(
      cardIdentityNames({
        name: 'Zoé',
        surname: 'Marchetti',
        portfolio: ['Léa Quillfeather', 'zoe.m', null],
        companies: ['Globex S.A.S.', 'Initrode', 'Siemens AG', undefined],
        places: ['Lyon, France', 'Paris (hybrid)']
      })
    ).toEqual([
      'Zoé Marchetti',
      'Marchetti Zoé',
      'Léa Quillfeather',
      'Quillfeather Léa',
      'zoe.m',
      'zoe m',
      'm zoe',
      'Marchetti',
      'Globex S.A.S.',
      'globex',
      'Initrode',
      'Siemens AG',
      'siemens',
      'Lyon, France',
      'Lyon',
      'France',
      'Paris (hybrid)',
      'Paris'
    ]);
  });

  it('names the candidate by their surname alone, and in both orders', () => {
    const names = cardIdentityNames({ name: 'Jean-Pierre', surname: 'De La Fontaine' });
    expect(names).toEqual([
      'Jean-Pierre De La Fontaine',
      'De La Fontaine Jean-Pierre',
      // The words of a surname of three letters or more
      'Fontaine'
    ]);
  });

  it('reads the name of an account without one in its email address: the local part, its words, both orders', () => {
    expect(cardIdentityNames({ email: 'zoe.marchetti92+jobs@gmail.com' })).toEqual([
      'zoe.marchetti92',
      'zoe marchetti',
      'marchetti zoe',
      'zoe',
      'marchetti'
    ]);
    // An address name in both orders, never a word of it alone (an address may be data-engineer)
    expect(cardIdentityNames({ portfolio: ['data-engineer'] })).toEqual(['data-engineer', 'data engineer', 'engineer data']);
  });

  it('takes no word of an email address that stands for nobody, and nothing of one that is only such words', () => {
    expect(cardIdentityNames({ email: 'contact@zoe-marchetti.fr' })).toEqual([]);
    expect(cardIdentityNames({ email: 'info.pro@acme.fr' })).toEqual([]);
    expect(cardIdentityNames({ email: 'data.zoe@acme.fr' })).toEqual(['data.zoe', 'data zoe', 'zoe data', 'zoe']);
  });

  it('finds a company without its long legal form or the words companies add (Corporation, Group, Labs)', () => {
    expect(
      cardIdentityNames({
        companies: ['Globex Corporation', 'BNP Paribas Group', 'Umbrella Labs', 'Hooli Holding Inc', 'Acme & Co', 'Data Group']
      })
    ).toEqual([
      'Globex Corporation',
      'globex',
      'BNP Paribas Group',
      'bnp paribas',
      'Umbrella Labs',
      'umbrella',
      'Hooli Holding Inc',
      'hooli',
      'Acme & Co',
      'acme',
      // What is left is a word that stands for nobody: the name stays whole, `Data engineer` names no company
      'Data Group'
    ]);
    expect(cardTextIdentifies('Senior data engineer', cardIdentityNames({ companies: ['Data Group'] }))).toBe(false);
    expect(cardTextIdentifies('Engineer, Data Group', cardIdentityNames({ companies: ['Data Group'] }))).toBe(true);
  });

  it('keeps names of two signs only as acronyms in capitals, of a company or a part of a place', () => {
    expect(
      cardIdentityNames({
        companies: ['EY', 'Ey', 'AT&T'],
        places: ['Toronto, ON', 'Berlin, DE', 'Bengaluru, in', '75', 'London, UK']
      })
    ).toEqual(['AT&T', 'Toronto, ON', 'Toronto', 'Berlin, DE', 'Berlin', 'Bengaluru, in', 'Bengaluru', 'London, UK', 'London', 'EY', 'ON', 'DE', 'UK']);
    // A two-letter portfolio name or given name is a word, not a way to find someone
    expect(cardIdentityNames({ name: 'Li', portfolio: ['jd'] })).toEqual([]);
  });

  it('leaves out the words that stand for no company or place, blanks, single letters and repeats', () => {
    expect(
      cardIdentityNames({
        name: ' ',
        companies: ['Freelance', 'Self-employed', 'Indépendant', 'X', 'Initrode', 'INITRODE'],
        places: ['Remote', 'Full remote', 'Télétravail']
      })
    ).toEqual(['Initrode']);
  });
});

describe('cardTextIdentifies', () => {
  const names = cardIdentityNames({
    name: 'Zoé',
    surname: 'Marchetti',
    email: 'zoe.marchetti@example.com',
    portfolio: ['Léa Quillfeather'],
    companies: ['Globex Corporation', 'EY', 'AT&T'],
    places: ['Lyon, France', 'Toronto, ON', 'Berlin, DE', 'Bengaluru, IN']
  });

  it.each([
    'Lead developer at Globex',
    'GLOBEX CORPORATION backend',
    'Tech lead (Lyon)',
    'Head of sales, France',
    'Senior consultant EY',
    'Network engineer, AT&T',
    'Engineer for Zoé Marchetti',
    'MARCHETTI Zoé, backend engineer',
    'Lead dev - Marchetti',
    'Founder, Marchetti Conseil',
    'lea quillfeather',
    'Quillfeather Léa',
    'Backend, see linkedin.com/in/zoe',
    'Designer, behance.net/zoe',
    'jane.net/cv',
    'zoemarchetti.dev',
    'zoe@example.com',
    'Call 06 12 34 56 78'
  ])('finds who the candidate is in %p', (text) => {
    expect(cardTextIdentifies(text, names)).toBe(true);
  });

  it.each([
    'Senior backend engineer',
    'Survey engineer',
    'Globexian platform',
    'Freelance remote developer',
    'ASP.NET/Azure developer',
    'Node.js/React',
    'Socket.IO and ML.NET',
    // Two-letter places and companies are acronyms: a word written in small letters names nothing
    'Focused on payments',
    'Chef de projet',
    'Ingénieur de données',
    'Engineer in test',
    'Lead developer at scale',
    'Consultant ey'
  ])('finds nobody in %p', (text) => {
    expect(cardTextIdentifies(text, names)).toBe(false);
  });
});

describe('emailDomainOf', () => {
  it.each([
    ['jane@acme.fr', 'acme.fr'],
    ['Jane.Doe@Mail.ACME.co.uk', 'mail.acme.co.uk'],
    ['odd@name@acme.io', 'acme.io'],
    ['jane@acme.fr.', 'acme.fr']
  ])('reads the domain of %p', (email, domain) => {
    expect(emailDomainOf(email)).toBe(domain);
  });

  it.each([undefined, 12, '', 'jane', '@acme.fr', 'jane@', 'jane@localhost', 'jane@acme..fr', 'jane@-acme.fr'])(
    'answers null for %p',
    (email) => {
      expect(emailDomainOf(email)).toBeNull();
    }
  );
});

describe('jobs in matching', () => {
  it('stay in matching while open or on hold, and leave it filled, closed or back to draft', () => {
    expect(MATCHING_JOB_STATUSES).toEqual(['open', 'on_hold']);
    expect(['draft', 'open', 'on_hold', 'filled', 'closed'].filter((status) => keepsMatching(status as never))).toEqual([
      'open',
      'on_hold'
    ]);
  });

  it('name their company and have a description, the company first', () => {
    expect(matchingJobProblem({ company: 'Acme', description: 'Build it.' })).toBeNull();
    expect(matchingJobProblem({ company: '  ', description: '' })).toMatchObject({ field: 'company' });
    expect(matchingJobProblem({ description: 'Build it.' })).toEqual({
      field: 'company',
      message: 'Name the company: candidates decide whether they are interested before they know who you are.'
    });
    expect(matchingJobProblem({ company: 'Acme', description: ' \n ' })).toMatchObject({ field: 'description' });
    expect(withLocale('fr', () => matchingJobProblem({ company: null })?.message)).toBe(
      "Indiquez l'entreprise\u00a0: les candidats disent s'ils sont intéressés avant de savoir qui vous êtes."
    );
  });

  it('are proposed to candidates only open, in matching and approved', () => {
    const job = (status: string, review?: string, enabledAt: Date | null = new Date()) =>
      ({ status, matching: { enabledAt, review: review ? { status: review } : null } }) as never;
    expect(jobLiveInMatching(job('open', 'approved'))).toBe(true);
    expect(jobLiveInMatching(job('on_hold', 'approved'))).toBe(false);
    expect(jobLiveInMatching(job('open', 'pending'))).toBe(false);
    expect(jobLiveInMatching(job('open', 'rejected'))).toBe(false);
    expect(jobLiveInMatching(job('open'))).toBe(false);
    expect(jobLiveInMatching(job('open', 'approved', null))).toBe(false);
    expect(jobLiveInMatching({ status: 'open' } as never)).toBe(false);
  });
});

describe('parseReviewReason', () => {
  it('asks a reason to reject a job, cleaned, on one line, and none to approve one', () => {
    expect(parseReviewReason('approve', 'Fine')).toEqual({ ok: true, reason: null });
    expect(parseReviewReason('reject', '  Say who\u200b the client is.\n\n Then ask again. ')).toEqual({
      ok: true,
      reason: 'Say who the client is. Then ask again.'
    });
    for (const reason of [undefined, '', ' \u200b\u202e ', 42]) {
      expect(parseReviewReason('reject', reason)).toEqual({
        ok: false,
        message: 'Say why the job is not accepted: its recruiter reads it.'
      });
    }
    expect(parseReviewReason('reject', 'x'.repeat(MATCHING_LIMITS.reviewReason))).toMatchObject({ ok: true });
    expect(parseReviewReason('reject', 'x'.repeat(MATCHING_LIMITS.reviewReason + 1))).toEqual({
      ok: false,
      message: `The reason can be ${MATCHING_LIMITS.reviewReason} characters at most.`
    });
  });
});

describe('canonicalJobSnapshot', () => {
  it('writes the same content as the same text, whatever the order of its keys', () => {
    const a = { title: 'Engineer', pay: { min: 1, max: 2, currency: 'EUR', period: 'year' } };
    const b = { pay: { period: 'year', currency: 'EUR', max: 2, min: 1 }, title: 'Engineer' };
    expect(canonicalJobSnapshot(a as never)).toBe(canonicalJobSnapshot(b as never));
    expect(canonicalJobSnapshot(a as never)).not.toBe(canonicalJobSnapshot({ ...a, title: 'Engineers' } as never));
  });
});

describe('MATCH_RETENTION', () => {
  it('keeps a decision six months at most, and a mutual interest three months once it ended', () => {
    expect(MATCH_RETENTION).toEqual({ decisionMonths: 6, endedMatchMonths: 3 });
    expect(matchDecisionExpiry(new Date('2026-01-15T10:00:00Z'))).toEqual(new Date('2026-07-15T10:00:00Z'));
    expect(matchDecisionExpiry('2026-11-20T00:00:00.000Z')).toEqual(new Date('2027-05-20T00:00:00Z'));
    expect(endedMatchExpiry(new Date('2026-11-30T08:00:00Z'))).toEqual(new Date('2027-03-02T08:00:00Z'));
  });
});
