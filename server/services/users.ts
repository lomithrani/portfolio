import type { Types } from 'mongoose';
import { User } from '../models/database';
import { ConflictError } from '../errors';
import type { GoogleIdentity } from './google';

const isDuplicateKeyError = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;

/** Public view of a user, as returned by /login and /isLogged */
export interface UserDto {
  _id: string;
  email: string;
  name?: string;
  surname?: string;
}

export const toUserDto = (user: {
  _id: Types.ObjectId | string;
  email: string;
  name?: string | null;
  surname?: string | null;
}): UserDto => ({
  _id: user._id.toString(),
  email: user.email,
  ...(user.name ? { name: user.name } : {}),
  ...(user.surname ? { surname: user.surname } : {})
});

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
