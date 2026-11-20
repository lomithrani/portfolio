// The rules of discovery (Path 2) in portfolio-common, shared by the API and
// the client: what a candidate must have set up (discoveryRequirements, read
// from their readiness), the consent (18 or over), its lapse, the state, the
// settings of the anonymous card. Pure functions: no database
import { describe, expect, it } from 'bun:test';
import {
  AGE_CONFIRMATION_KEYS,
  DISCOVERY_CONSENT_KEYS,
  DISCOVERY_INACTIVITY_DAYS,
  DISCOVERY_LIMITS,
  DISCOVERY_MIN_CRITERIA,
  DISCOVERY_REQUIREMENTS,
  LEGAL_VERSION,
  MINIMUM_AGE,
  MINIMUM_DISCOVERY_AGE,
  cleanHeadline,
  currentDiscoveryConsent,
  discoveryConsentCutoff,
  discoveryConsentExpiry,
  discoveryConsentKey,
  discoveryInactive,
  discoveryRequirementMessage,
  discoveryRequirements,
  discoveryState,
  emailDomainOf,
  legalMessages,
  parseDiscoveryCard,
  parseDiscoveryConsent,
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
    'ftp://files.example.com'
  ])('refuses a way to reach the candidate in the headline: %p', (headline) => {
    expect(parseDiscoveryCard({ headline })).toMatchObject({ ok: false, property: 'card.headline' });
  });

  it('keeps a headline with an @ that is no address', () => {
    expect(parseDiscoveryCard({ headline: 'Lead dev @ fintech, 10 years' })).toMatchObject({ ok: true });
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
