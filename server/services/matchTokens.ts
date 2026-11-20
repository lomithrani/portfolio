import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { env } from '../env';

// The token of a candidate's anonymous card in a recruiter's feed (Path 2,
// matching, behind MATCHING: services/matchFeeds.ts), which stands for the
// candidate instead of their account id. A recruiter never gets an id: an id
// would follow the same person from one job to the next, and from one read to
// the next. What a decision on a card (2.8) sends back is this token, in the
// body of the request, never in its path (paths reach traces).
//
// AES-256-GCM, with a key derived from JWT_SECRET (as rateLimit.ts derives the
// key of its hashes: no setting of its own; a new JWT_SECRET makes every token
// shown before unreadable, and the feed is read again). It holds the candidate's
// id and when it was made, and is bound to the recruiter and the job it was
// made for (its additional data): opened for another recruiter or another job,
// it is nothing. A random nonce for each token, so the same candidate's token
// differs at every read and for every job: two tokens tell nothing of whether
// they stand for one person. Nothing is stored to make one or to read one.

/** How long a token is read: a card a recruiter decides on within a week, else the feed is read again */
export const MATCH_TOKEN_TTL_MS = 7 * 24 * 60 * 60_000;

/** How far ahead of the clock reading it a token may have been made (servers' clocks differ a little) */
const CLOCK_SKEW_MS = 60_000;

const KEY = createHmac('sha256', env.JWT_SECRET).update('portfolio:matchTokens').digest();
const VERSION = 1;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
/** An ObjectId (12 bytes), then when the token was made (milliseconds, 8 bytes) */
const PAYLOAD_BYTES = 12 + 8;
const TOKEN_BYTES = 1 + NONCE_BYTES + PAYLOAD_BYTES + TAG_BYTES;

const isObjectId = (value: string) => /^[0-9a-f]{24}$/i.test(value) && Types.ObjectId.isValid(value);

/** What a token is bound to: the recruiter it was shown to, and the job it was shown for */
export interface MatchTokenScope {
  recruiterId: string;
  jobId: string;
}

/** The additional data a token is sealed with: its version, the recruiter's and the job's ids */
const boundTo = ({ recruiterId, jobId }: MatchTokenScope) =>
  Buffer.from(`match-card:v${VERSION}:${recruiterId.toLowerCase()}:${jobId.toLowerCase()}`, 'utf8');

/**
 * The token of the candidate `candidateId`'s card, as `scope.recruiterId` reads it for the job
 * `scope.jobId`: base64url, different at each call. Throws for an id that is not one (a bug)
 */
export function sealMatchToken(candidateId: string, scope: MatchTokenScope, now = new Date()): string {
  if (!isObjectId(candidateId) || !isObjectId(scope.recruiterId) || !isObjectId(scope.jobId)) {
    throw new Error('A match token is made of ids');
  }
  const nonce = randomBytes(NONCE_BYTES);
  const payload = Buffer.alloc(PAYLOAD_BYTES);
  Buffer.from(candidateId, 'hex').copy(payload, 0);
  payload.writeBigInt64BE(BigInt(now.getTime()), 12);
  const cipher = createCipheriv('aes-256-gcm', KEY, nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(boundTo(scope));
  const sealed = Buffer.concat([cipher.update(payload), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), nonce, sealed, cipher.getAuthTag()]).toString('base64url');
}

/**
 * The candidate id a token stands for, when it was made by this server for `scope` (the same
 * recruiter and the same job) less than MATCH_TOKEN_TTL_MS ago; null for anything else: a token
 * made for another recruiter or another job, an older one, one changed by a single bit, or text
 * that is not a token. Never throws
 */
export function openMatchToken(token: unknown, scope: MatchTokenScope, now = new Date()): string | null {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  if (!isObjectId(scope.recruiterId) || !isObjectId(scope.jobId)) return null;
  const bytes = Buffer.from(token, 'base64url');
  if (bytes.length !== TOKEN_BYTES || bytes[0] !== VERSION) return null;
  const nonce = bytes.subarray(1, 1 + NONCE_BYTES);
  const sealed = bytes.subarray(1 + NONCE_BYTES, 1 + NONCE_BYTES + PAYLOAD_BYTES);
  const tag = bytes.subarray(1 + NONCE_BYTES + PAYLOAD_BYTES);
  try {
    const decipher = createDecipheriv('aes-256-gcm', KEY, nonce, { authTagLength: TAG_BYTES });
    decipher.setAAD(boundTo(scope));
    decipher.setAuthTag(tag);
    const payload = Buffer.concat([decipher.update(sealed), decipher.final()]);
    const madeAt = Number(payload.readBigInt64BE(12));
    const age = now.getTime() - madeAt;
    if (!Number.isFinite(madeAt) || age < -CLOCK_SKEW_MS || age > MATCH_TOKEN_TTL_MS) return null;
    return payload.subarray(0, 12).toString('hex');
  } catch {
    // Not sealed with this key for this scope: changed, or made for someone or something else
    return null;
  }
}
