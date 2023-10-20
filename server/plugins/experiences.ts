import { Domain, Experience } from 'models/database';
import { experienceRequest } from 'models/elysia'
import { Elysia } from 'elysia';
import { corsConf } from './corsConf';
import { userLogged } from './userLogged';
import { DomainDoesNotExistError } from 'errors';

export const experiences = new Elysia()
  .use(corsConf())
  .use(experienceRequest)
  .get('/experiences', async () => await Experience.find())
  .use(userLogged)
  .post(
    '/experiences',
    async ({ body, userId }) => {

      const domain = await Domain.findOne({ admin: userId });

      if (!domain) {
        throw new DomainDoesNotExistError(userId!)
      }

      let experience = new Experience()
      experience.title = body.title
      experience.summary = body.summary
      experience.type = body.type

      return await experience.save();
    },
    {
      body: 'experienceRequest'
    }
  )