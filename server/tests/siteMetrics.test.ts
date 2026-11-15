// The `portfolio.records` gauge of services/siteMetrics.ts: what Grafana reads
// the number of portfolios, accounts... from. The gauge is checked through a
// real meter provider with counts of its own (no database); the counts
// themselves against a real MongoDB (MONGO_URL, local or from
// TEST_MONGO_URL), as differences: each test creates its own records, named
// with a unique suffix, and removes them, so the tests pass in any order.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import mongoose from 'mongoose';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader
} from '@opentelemetry/sdk-metrics';
import { env } from '../env';
import { Domain, JobPosting, User } from '../models/database';
import { logger } from '../services/logger';
import {
  SITE_RECORD_KINDS,
  SITE_RECORDS_MAX_AGE_MS,
  countSiteRecords,
  registerSiteMetrics
} from '../services/siteMetrics';
import type { SiteRecordCounts } from '../services/siteMetrics';
import { COMPLETE_POSTINGS } from './completePostings';
import { assertDisposableDatabase } from './testDatabase';

afterEach(() => {
  mock.restore();
});

const counts = (overrides: Partial<SiteRecordCounts> = {}): SiteRecordCounts => ({
  portfolios: 12,
  accounts: 30,
  recruiters: 4,
  experiences: 57,
  job_postings: 9,
  open_job_postings: 5,
  job_applications: 3,
  journeys_started: 2,
  upcoming_bookings: 1,
  ...overrides
});

/** A meter whose metrics are read on demand, as the exporter would every minute */
const collector = () => {
  const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 3_600_000 });
  const provider = new MeterProvider({ readers: [reader] });
  /** The gauge's points of one export, as { kind: value } */
  const collect = async () => {
    exporter.reset();
    await reader.forceFlush();
    const records: Record<string, number> = {};
    for (const resourceMetrics of exporter.getMetrics()) {
      for (const scope of resourceMetrics.scopeMetrics) {
        for (const metric of scope.metrics) {
          if (metric.descriptor.name !== 'portfolio.records') continue;
          for (const point of metric.dataPoints) {
            records[String(point.attributes.kind)] = point.value as number;
          }
        }
      }
    }
    return records;
  };
  return { meter: provider.getMeter('site-metrics-test'), collect, shutdown: () => provider.shutdown() };
};

describe('portfolio.records gauge', () => {
  let telemetry: ReturnType<typeof collector>;

  beforeEach(() => {
    telemetry = collector();
  });

  afterEach(async () => {
    await telemetry.shutdown();
  });

  it('reports one value per kind of record', async () => {
    registerSiteMetrics(telemetry.meter, { count: async () => counts(), ready: () => true });

    const records = await telemetry.collect();

    expect(records).toEqual(counts());
    expect(Object.keys(records).sort()).toEqual([...SITE_RECORD_KINDS].sort());
  });

  it('reads the counts again only once they are five minutes old', async () => {
    let time = 1_000_000;
    let portfolios = 12;
    const count = mock(async () => counts({ portfolios }));
    registerSiteMetrics(telemetry.meter, { count, ready: () => true, now: () => time });

    expect((await telemetry.collect()).portfolios).toBe(12);
    portfolios = 13;
    time += SITE_RECORDS_MAX_AGE_MS - 1;
    expect((await telemetry.collect()).portfolios).toBe(12);
    expect(count).toHaveBeenCalledTimes(1);

    time += 1;
    expect((await telemetry.collect()).portfolios).toBe(13);
    expect(count).toHaveBeenCalledTimes(2);
  });

  it('reports nothing while MongoDB is away, without asking it', async () => {
    let connected = false;
    const count = mock(async () => counts());
    registerSiteMetrics(telemetry.meter, { count, ready: () => connected });

    expect(await telemetry.collect()).toEqual({});
    expect(count).not.toHaveBeenCalled();

    connected = true;
    expect(await telemetry.collect()).toEqual(counts());
  });

  it('reports nothing when the counts cannot be read, then reads them again at the next export', async () => {
    const warn = spyOn(logger, 'warn').mockImplementation(() => {});
    let fail = true;
    const count = mock(async () => {
      if (fail) throw new Error('connection lost');
      return counts();
    });
    registerSiteMetrics(telemetry.meter, { count, ready: () => true });

    expect(await telemetry.collect()).toEqual({});
    expect(warn).toHaveBeenCalledWith('Site record counts could not be read', { error: 'connection lost' });

    fail = false;
    expect(await telemetry.collect()).toEqual(counts());
  });
});

describe('countSiteRecords', () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const email = (name: string) => `site-metrics-${name}-${suffix}@example.com`;
  let connected = false;

  beforeAll(async () => {
    assertDisposableDatabase(env.MONGO_URL);
    await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
    connected = true;
    await Promise.all([User.init(), Domain.init(), JobPosting.init()]);
  });

  afterAll(async () => {
    if (!connected) return;
    const users = await User.find({ email: new RegExp(`-${suffix}@`) }).select('_id');
    const ids = users.map((user) => user._id);
    await JobPosting.deleteMany({ recruiter: { $in: ids } });
    await Domain.deleteMany({ admin: { $in: ids } });
    await User.deleteMany({ _id: { $in: ids } });
    await mongoose.disconnect();
  });

  it('counts portfolios, accounts, recruiters and job postings, open ones apart', async () => {
    const before = await countSiteRecords();

    const candidate = await User.create({ email: email('candidate'), googleId: `sub-candidate-${suffix}` });
    const recruiter = await User.create({
      email: email('recruiter'),
      googleId: `sub-recruiter-${suffix}`,
      recruiter: { enabledAt: new Date(), plan: 'free' }
    });
    await Domain.create({ name: `site-metrics-${suffix}`, admin: candidate._id, experiences: [] });
    await JobPosting.create({ ...COMPLETE_POSTINGS[0], recruiter: recruiter._id, status: 'draft' });
    await JobPosting.create({
      ...COMPLETE_POSTINGS[0],
      recruiter: recruiter._id,
      status: 'open',
      publishedAt: new Date()
    });

    const after = await countSiteRecords();

    expect(Object.keys(after).sort()).toEqual([...SITE_RECORD_KINDS].sort());
    expect(after.portfolios - before.portfolios).toBe(1);
    expect(after.accounts - before.accounts).toBe(2);
    expect(after.recruiters - before.recruiters).toBe(1);
    expect(after.job_postings - before.job_postings).toBe(2);
    expect(after.open_job_postings - before.open_job_postings).toBe(1);
  });
});
