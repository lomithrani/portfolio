import { Domain, Experience } from 'models/database';
import Elysia, { t } from 'elysia';
import { ExperienceType } from 'portfolio-common'
import { corsConf } from './corsConf';
import { userLogged } from './userLogged';
import { CannotSaveExperienceError, DomainDoesNotExistError } from 'errors';

export const experiences = new Elysia()
  .use(corsConf())
  .get('/experiences', async () => await Experience.find())
  .use(userLogged)
  .post('/experiences', async ({ body, userId }) => {
    const domain = await Domain.findOne({ admin: userId });

    if (!domain) throw new DomainDoesNotExistError(userId)

    let experience = new Experience()
    experience.title = body.title
    experience.summary = body.summary
    experience.type = body.type

    const result = await experience.save();

    if (!result) throw new CannotSaveExperienceError(userId)

    domain.experiences.push(result.id)

    await domain.save();

    return result;
  },
    {
      body: t.Object({
        type: t.Union([
          t.Literal(ExperienceType.Educational),
          t.Literal(ExperienceType.Professional),
          t.Literal(ExperienceType.Leisure),
          t.Literal(ExperienceType.Personal),
        ]),
        title: t.String(),
        summary: t.String(),
      }),
      detail: {
        summary: 'Add new experience'
      }
    })