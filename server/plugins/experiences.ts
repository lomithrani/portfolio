import { Domain, Experience } from '../models/database';
import Elysia, { t } from 'elysia';
import { ExperienceType } from 'portfolio-common'
import { corsConf } from './corsConf';
import { userLogged } from './userLogged';
import { CannotSaveExperienceError, DomainDoesNotExistError } from '../errors';
import { experienceRequest } from '../models/elysia';

export const experiences = new Elysia()
  .use(corsConf())
  .use(userLogged)
  .post('/experiences', async ({ body, userId }) => {
    const domain = await Domain.findOne({ admin: userId });

    if (!domain) throw new DomainDoesNotExistError(userId)

    let experience = new Experience(body);

    const result = await experience.save();

    if (!result) throw new CannotSaveExperienceError(userId)

    domain.experiences.push(result.id)

    await domain.save();

    return result;
  },
    {
      body: experienceRequest,
      detail: {
        summary: 'Add new experience'
      }
    })