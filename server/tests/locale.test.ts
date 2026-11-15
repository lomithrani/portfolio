// The language of the API's answers (services/locale.ts, docs/I18N.md): a request that sends
// `Accept-Language: fr` gets its texts in French, any other one in English; the bodies the
// client matches and the log lines stay in English. Against a real MongoDB (MONGO_URL, local
// or from TEST_MONGO_URL), which these tests only read: they ask for ids and names no one has.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import mongoose, { Types } from 'mongoose';
import { getLocale, legalMessages, withLocale } from 'portfolio-common';
import { env } from '../env';
import { createApp } from '../app';
import { BadRequestError, TooManyRequestsError } from '../errors';
import { m as appointmentMessages } from '../plugins/appointments.messages';
import { DOMAIN_NOT_FOUND } from '../protocol';
import { resolveError } from '../services/errorHandler';
import { normalizeJobExtraction } from '../services/jobExtraction';
import { runWithLocale } from '../services/locale';
import { logger } from '../services/logger';
import { m as limits } from '../services/rateLimit.messages';
import { normalizeExtraction } from '../services/resumeExtraction';
import { assertDisposableDatabase } from './testDatabase';

const SCHEDULE_NOT_FOUND = { en: 'Schedule not found', fr: 'Agenda de rendez-vous introuvable' };

let app: ReturnType<typeof createApp>;
let connected = false;

beforeAll(async () => {
  assertDisposableDatabase(env.MONGO_URL);
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  connected = true;
});

afterAll(async () => {
  if (connected) await mongoose.disconnect();
});

beforeEach(() => {
  app = createApp();
});

afterEach(() => {
  mock.restore();
});

const call = async (
  method: string,
  path: string,
  { language, body }: { language?: string; body?: unknown } = {}
) => {
  const headers: Record<string, string> = {};
  if (language !== undefined) headers['Accept-Language'] = language;
  const text = body === undefined ? undefined : JSON.stringify(body);
  if (text !== undefined) headers['Content-Type'] = 'application/json';
  const response = await app.fetch(new Request(`http://localhost${path}`, { method, headers, body: text }));
  const responseText = await response.text();
  return { status: response.status, text: responseText, json: <T = any>() => JSON.parse(responseText) as T };
};

/** The public page of a schedule no one has: a 404 whose text is a message */
const unknownSchedule = (language?: string) =>
  call('GET', `/appointments/schedules/${new Types.ObjectId().toString()}/public`, { language });

/** A sign-in that confirms an older version of the terms: refused (422) before Google is asked anything */
const staleSignIn = (language?: string) =>
  call('POST', '/login', {
    language,
    body: { token: 'not-a-google-token', consent: { termsVersion: '2025-01-01', ageConfirmed: true } }
  });

describe('the language of a request', () => {
  it('answers in English without Accept-Language', async () => {
    const result = await unknownSchedule();

    expect(result.status).toBe(404);
    expect(result.text).toBe(SCHEDULE_NOT_FOUND.en);
  });

  it('answers in French to Accept-Language: fr', async () => {
    const result = await unknownSchedule('fr');

    expect(result.status).toBe(404);
    expect(result.text).toBe(SCHEDULE_NOT_FOUND.fr);
  });

  it.each([
    ['fr-FR,fr;q=0.9,en;q=0.8', 'fr'],
    ['en;q=0.5, fr', 'fr'],
    ['en-GB,en;q=0.9,fr;q=0.8', 'en'],
    ['de-DE,de;q=0.9', 'en'],
    ['', 'en']
  ] as const)('reads Accept-Language "%s" as %s', async (header, expected) => {
    expect((await unknownSchedule(header)).text).toBe(SCHEDULE_NOT_FOUND[expected]);
  });

  it("answers a 422 of a portfolio-common rule in the request's language", async () => {
    const [english, french] = await Promise.all([staleSignIn(), staleSignIn('fr')]);

    expect(english.status).toBe(422);
    expect(english.json()).toEqual({
      type: 'validation',
      on: 'body',
      property: 'consent.termsVersion',
      message: legalMessages.staleTerms
    });
    expect(french.status).toBe(422);
    expect(french.json()).toEqual({
      type: 'validation',
      on: 'body',
      property: 'consent.termsVersion',
      message: withLocale('fr', () => legalMessages.staleTerms)
    });
    expect(french.json().message).not.toBe(english.json().message);
  });

  it('keeps a body the client matches in English', async () => {
    const name = `locale-missing-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

    const [english, french] = await Promise.all([
      call('GET', `/domain/${name}`),
      call('GET', `/domain/${name}`, { language: 'fr' })
    ]);

    expect(english.status).toBe(404);
    expect(english.text).toBe(DOMAIN_NOT_FOUND);
    expect(french.status).toBe(404);
    expect(french.text).toBe('Domain not found');
  });

  it('keeps an HTTP reason phrase in English', async () => {
    const result = await call('GET', '/me', { language: 'fr' });

    expect(result.status).toBe(401);
    expect(result.text).toBe('Unauthorized');
  });

  it('does not mix the languages of concurrent requests', async () => {
    const languages = Array.from({ length: 40 }, (_, index) => (index % 2 ? 'fr' : 'en') as 'en' | 'fr');

    const results = await Promise.all(
      languages.map((language) => (language === 'fr' ? unknownSchedule('fr') : unknownSchedule()))
    );

    expect(results.map((result) => result.text)).toEqual(languages.map((language) => SCHEDULE_NOT_FOUND[language]));
  });

  it('is English again once the request is over', async () => {
    await unknownSchedule('fr');

    expect(getLocale()).toBe('en');
    expect(appointmentMessages.scheduleNotFound).toBe(SCHEDULE_NOT_FOUND.en);
  });

  it('logs in English what it answers in French', async () => {
    const warn = spyOn(logger, 'warn');

    const result = await unknownSchedule('fr');

    expect(result.text).toBe(SCHEDULE_NOT_FOUND.fr);
    expect(warn).toHaveBeenCalledWith(SCHEDULE_NOT_FOUND.en, expect.objectContaining({ status: 404, method: 'GET' }));
    expect(JSON.stringify(warn.mock.calls)).not.toContain(SCHEDULE_NOT_FOUND.fr);
  });
});

describe('an error in the language of its request', () => {
  it('has its message in that language and keeps the English for the log', () => {
    const error = runWithLocale('fr', () => new BadRequestError(() => appointmentMessages.tooManyDates(62)));

    expect(error.message).toBe('62 dates au plus par requête');
    expect(error.english).toBe('At most 62 dates per request');
    expect(resolveError('UNKNOWN', error)).toEqual({
      status: 400,
      body: '62 dates au plus par requête',
      logMessage: 'At most 62 dates per request',
      level: 'warn'
    });
  });

  it('follows the plural of each language', () => {
    const tooMany = (minutes: number) =>
      new TooManyRequestsError(() => limits.tooManyRequestsFromNetwork(limits.wait.minutes(minutes)), 60);

    expect(tooMany(1).message).toBe('Too many requests from your network. Try again in 1 minute');
    expect(runWithLocale('fr', () => tooMany(1)).message).toBe(
      'Trop de requêtes depuis votre réseau. Réessayez dans 1 minute'
    );
    expect(runWithLocale('fr', () => tooMany(5))).toMatchObject({
      message: 'Trop de requêtes depuis votre réseau. Réessayez dans 5 minutes',
      english: 'Too many requests from your network. Try again in 5 minutes'
    });
  });

  it('is the same text for the body and the log in English, and for a plain text in any language', () => {
    const english = new BadRequestError(() => appointmentMessages.invalidDate);
    expect(resolveError('UNKNOWN', english)).toEqual({ status: 400, body: 'Invalid date', level: 'warn' });

    const plain = runWithLocale('fr', () => new BadRequestError(DOMAIN_NOT_FOUND));
    expect(plain).toMatchObject({ message: DOMAIN_NOT_FOUND, english: DOMAIN_NOT_FOUND });
    expect(resolveError('UNKNOWN', plain)).toEqual({ status: 400, body: DOMAIN_NOT_FOUND, level: 'warn' });
  });
});

describe('texts of a successful answer', () => {
  it("writes the résumé import's warnings in the request's language", () => {
    const output = { experiences: [{ nothing: 'like an experience' }] };

    expect(normalizeExtraction(output).warnings).toEqual([
      'Skipped 1 entry that came back in an unexpected shape',
      'No experiences were found in this file'
    ]);
    expect(runWithLocale('fr', () => normalizeExtraction(output)).warnings).toEqual([
      '1 entrée ignorée\u00a0: sa forme était inattendue',
      "Aucune expérience n'a été trouvée dans ce fichier"
    ]);
  });

  it("names the fields of a job description in the request's language", () => {
    const output = { title: 'Engineer', contractType: 'forever' };

    expect(normalizeJobExtraction(output).warnings[0]).toBe(
      'Left out the contract type ("forever"): it is not one of the accepted values'
    );
    expect(runWithLocale('fr', () => normalizeJobExtraction(output)).warnings[0]).toBe(
      'Type de contrat («\u00a0forever\u00a0»)\u00a0: valeur ignorée, ce n\'est pas l\'une des valeurs acceptées'
    );
  });
});
