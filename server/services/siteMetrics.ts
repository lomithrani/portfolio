// How much the site holds, for the Grafana dashboards (docs/grafana): the
// number of portfolios, accounts, recruiters... as one gauge,
// `portfolio.records`, with a `kind` attribute. Counts only: nothing about a
// person or a visitor. Read when the metrics are exported (every minute), so
// nothing runs while metrics are off.
import mongoose from 'mongoose'
import { metrics } from '@opentelemetry/api'
import type { Meter } from '@opentelemetry/api'
import {
  AppointmentBooking,
  Domain,
  Experience,
  JobPosting,
  User,
  WorkflowInstance
} from '../models/database'
import { logger } from './logger'

/** What `portfolio.records` counts: the values of its `kind` attribute */
export const SITE_RECORD_KINDS = [
  'portfolios',
  'accounts',
  'recruiters',
  'experiences',
  'job_postings',
  'open_job_postings',
  'journeys_started',
  'upcoming_bookings'
] as const

export type SiteRecordKind = (typeof SITE_RECORD_KINDS)[number]
export type SiteRecordCounts = Record<SiteRecordKind, number>

/** The counts are read again from MongoDB at most this often */
export const SITE_RECORDS_MAX_AGE_MS = 5 * 60_000

/** One count per kind. Whole collections are counted from their metadata, the others with a filter */
export const countSiteRecords = async (): Promise<SiteRecordCounts> => {
  const [
    portfolios,
    accounts,
    recruiters,
    experiences,
    jobPostings,
    openJobPostings,
    journeysStarted,
    upcomingBookings
  ] = await Promise.all([
    Domain.estimatedDocumentCount(),
    User.estimatedDocumentCount(),
    User.countDocuments({ 'recruiter.enabledAt': { $exists: true } }),
    Experience.estimatedDocumentCount(),
    JobPosting.estimatedDocumentCount(),
    JobPosting.countDocuments({ status: 'open' }),
    // A visitor's progress in an owner's hiring journey, created by their first submit
    WorkflowInstance.estimatedDocumentCount(),
    // MongoDB removes a booking once its slot is over
    AppointmentBooking.estimatedDocumentCount()
  ])
  return {
    portfolios,
    accounts,
    recruiters,
    experiences,
    job_postings: jobPostings,
    open_job_postings: openJobPostings,
    journeys_started: journeysStarted,
    upcoming_bookings: upcomingBookings
  }
}

interface SiteMetricsOptions {
  /** Reads the counts (tests give their own) */
  count?: () => Promise<SiteRecordCounts>
  /** Whether MongoDB can be asked; without it nothing is reported */
  ready?: () => boolean
  now?: () => number
}

/**
 * Registers the `portfolio.records` gauge on `meter`. Each export reports the
 * counts read at most SITE_RECORDS_MAX_AGE_MS ago. While MongoDB is away or a
 * count fails, nothing is reported (a gap in Grafana, not a zero).
 */
export const registerSiteMetrics = (
  meter: Meter = metrics.getMeter('portfolio-server'),
  {
    count = countSiteRecords,
    ready = () => mongoose.connection.readyState === 1,
    now = Date.now
  }: SiteMetricsOptions = {}
) => {
  let cached: { counts: SiteRecordCounts; readAt: number } | undefined

  const gauge = meter.createObservableGauge('portfolio.records', {
    description: 'Number of records the site holds, by kind'
  })
  gauge.addCallback(async (result) => {
    if (!ready()) return
    if (!cached || now() - cached.readAt >= SITE_RECORDS_MAX_AGE_MS) {
      try {
        cached = { counts: await count(), readAt: now() }
      } catch (error) {
        cached = undefined
        logger.warn('Site record counts could not be read', {
          error: error instanceof Error ? error.message : String(error)
        })
        return
      }
    }
    for (const kind of SITE_RECORD_KINDS) result.observe(cached.counts[kind], { kind })
  })
}
