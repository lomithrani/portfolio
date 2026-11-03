import { Domain, Experience, EXPERIENCE_POPULATE } from '../models/database';
import { experienceFieldsFromRequest } from '../models/database/experience';
import Elysia from 'elysia';
import { userLogged } from './userLogged';
import { DomainDoesNotExistError, ResourceNotFoundError } from '../errors';
import { experienceRequest, objectIdParams } from '../models/elysia';
import { logger } from '../services/logger';

/** The caller's domain, if `id` is one of its experiences (404 otherwise) */
const findDomainWithExperience = async (userId: string, id: string) => {
  const domain = await Domain.findOne({ admin: userId });

  if (!domain) throw new DomainDoesNotExistError('You do not own a domain');

  if (!domain.experiences.some((expId) => expId.toString() === id)) {
    throw new ResourceNotFoundError('Experience not found in your domain')
  }
  return domain;
};

export const experiences = new Elysia()
  .use(userLogged)
  .post('/experiences', async ({ body, userId }) => {
    const domain = await Domain.findOne({ admin: userId });

    if (!domain) throw new DomainDoesNotExistError('You do not own a domain');

    const experience = await Experience.fromRequest(body);

    const result = await experience.save();

    // Appended atomically (concurrent saves of the domain cannot drop it). On
    // failure the new experience is removed: it would be reachable from nowhere
    try {
      const { matchedCount } = await Domain.updateOne(
        { _id: domain._id },
        { $push: { experiences: result._id } }
      );
      if (matchedCount === 0) throw new DomainDoesNotExistError('You do not own a domain');
    } catch (error) {
      await Experience.deleteOne({ _id: result._id }).catch((cleanupError: unknown) => {
        logger.error('Could not remove an experience its domain did not take', {
          errorName: cleanupError instanceof Error ? cleanupError.name : typeof cleanupError
        });
      });
      throw error;
    }

    // Same shape (and type) as GET /domain/:name's experiences, so the client
    // can render it directly
    await result.populate(EXPERIENCE_POPULATE);
    return result.toObject<Experience>();
  },
    {
      body: experienceRequest,
      detail: {
        summary: 'Add new experience'
      }
    })
  .put('/experiences/:id', async ({ body, userId, params: { id } }) => {
    await findDomainWithExperience(userId, id);

    const experience = await Experience.findById(id);

    if (!experience) throw new ResourceNotFoundError('Experience not found')

    experience.set(await experienceFieldsFromRequest(body));

    const result = await experience.save();

    await result.populate(EXPERIENCE_POPULATE);
    return result.toObject<Experience>();
  },
    {
      params: objectIdParams,
      body: experienceRequest,
      detail: {
        summary: 'Edit experience'
      }
    })
  .delete('/experiences/:id', async ({ userId, params: { id } }) => {
    const domain = await findDomainWithExperience(userId, id);

    // Unlisted first, atomically: a failure after this leaves an unreachable
    // document, never a listed id without its experience
    const { modifiedCount } = await Domain.updateOne(
      { _id: domain._id, experiences: id },
      { $pull: { experiences: id } }
    );
    // Removed by a concurrent request in the meantime
    if (modifiedCount === 0) throw new ResourceNotFoundError('Experience not found in your domain');

    await Experience.deleteOne({ _id: id });

    return { id };
  },
    {
      params: objectIdParams,
      detail: {
        summary: 'Delete experience'
      }
    })
