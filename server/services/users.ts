import { Types } from 'mongoose';
import { USER_MODES } from 'portfolio-common';
import type { UserMode } from 'portfolio-common';
import { Domain, User } from '../models/database';
import { ConflictError, CouldntVerifyJwtError } from '../errors';
import type { GoogleIdentity } from './google';
import { isDuplicateKeyError } from './mongoErrors';
import { enableRecruiterSpace } from './recruiters';

/** Public view of a user, as returned by /login, /isLogged, GET /me and PUT /me/mode */
export interface UserDto {
  _id: string;
  email: string;
  name?: string;
  surname?: string;
  /** The space the account last chose; unset until it first chooses one */
  activeMode?: UserMode;
  /** Whether the account has a recruiter space */
  recruiter: boolean;
  /** Name of the domain (portfolio) the account owns, if any */
  domain?: string;
}

const isUserMode = (value: unknown): value is UserMode =>
  (USER_MODES as readonly unknown[]).includes(value);

/** The public fields of `user`; `domain` is the name of the domain it owns (see accountDto) */
export const toUserDto = (
  user: {
    _id: Types.ObjectId | string;
    email: string;
    name?: string | null;
    surname?: string | null;
    activeMode?: string | null;
    recruiter?: object | null;
  },
  domain?: string | null
): UserDto => ({
  _id: user._id.toString(),
  email: user.email,
  ...(user.name ? { name: user.name } : {}),
  ...(user.surname ? { surname: user.surname } : {}),
  ...(isUserMode(user.activeMode) ? { activeMode: user.activeMode } : {}),
  recruiter: !!user.recruiter,
  ...(domain ? { domain } : {})
});

/** Name of the domain the user owns, if any (an account claims at most one: POST /domain/claim) */
export const ownedDomainName = async (userId: Types.ObjectId | string) =>
  (await Domain.findOne({ admin: userId }, { name: 1 }))?.name;

/** toUserDto, with the domain the user owns looked up */
export const accountDto = async (user: Parameters<typeof toUserDto>[0]) =>
  toUserDto(user, await ownedDomainName(user._id));

// A valid session whose account no longer exists: what /isLogged answers as
// "Unknown user", as a 401 for the routes that need the account
const unknownUser = () => new CouldntVerifyJwtError('Unauthorized: unknown user');

/** The account of a session; 401 when it no longer exists */
export const findAccount = async (userId: string) => {
  const user = Types.ObjectId.isValid(userId) ? await User.findById(userId) : null;
  if (!user) throw unknownUser();
  return user;
};

/**
 * Makes `mode` the account's active space. Choosing 'recruiter' creates the
 * recruiter space the first time; an existing one keeps its plan and imports
 * used. Returns the updated user; 401 when the account no longer exists.
 */
export const setActiveMode = async (userId: string, mode: UserMode) => {
  if (!Types.ObjectId.isValid(userId)) throw unknownUser();
  // The space first: an account never shows the recruiter mode without one
  if (mode === 'recruiter' && !(await enableRecruiterSpace(userId))) throw unknownUser();
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { activeMode: mode } },
    { returnDocument: 'after' }
  );
  if (!user) throw unknownUser();
  return user;
};

/**
 * Finds the user for a verified Google identity. Users are matched by their
 * Google `sub` first; accounts created before `googleId` existed are matched
 * once by verified email and linked to the `sub`. An email already linked to a
 * different Google account is never taken over.
 */
export const findOrCreateGoogleUser = async ({ sub, email }: GoogleIdentity) => {
  const bySub = await User.findOne({ googleId: sub });
  if (bySub) return bySub;

  const legacy = await User.findOneAndUpdate(
    { email, $or: [{ googleId: { $exists: false } }, { googleId: null }] },
    { $set: { googleId: sub } },
    { returnDocument: 'after' }
  );
  if (legacy) return legacy;

  try {
    return await User.create({ email, googleId: sub });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    // Concurrent first login with the same Google account
    const created = await User.findOne({ googleId: sub });
    if (created) return created;
    throw new ConflictError('This email is linked to a different Google account');
  }
};
