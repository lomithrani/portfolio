import { createHash } from 'node:crypto';
import { canonicalJobSnapshot } from 'portfolio-common';
import type { JobSnapshot } from 'portfolio-common';
import type { JobPosting as StoredJobPosting } from '../models/database/jobPosting';
import { storedJobSnapshot, toJobSnapshot } from './jobPostings';

// The version of a posting matching compares and reviews, apart from
// jobMatching.ts so that what loads it without the API's environment (the e2e
// seed, which approves its job in matching with it) does not load env.ts

/** The version of a stored posting as a share or a snapshot of it now keeps it, to compare */
export const versionNow = (posting: StoredJobPosting): JobSnapshot => {
  const snapshot = toJobSnapshot(posting);
  return storedJobSnapshot(snapshot) ?? snapshot;
};

/**
 * The version of a posting a review is of: a hash of it as candidates read it (its JobSnapshot,
 * normalised, the keys in order), the same for the same content. A review holds for that version
 * only: changed since, the job is pending again
 */
export const reviewedVersion = (job: StoredJobPosting): string =>
  createHash('sha256').update(canonicalJobSnapshot(versionNow(job))).digest('base64url');
