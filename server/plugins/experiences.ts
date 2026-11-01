import { Company, Domain, Experience, EXPERIENCE_POPULATE } from '../models/database';
import { projectsFromRequest } from '../models/database/experience';
import Elysia, { t } from 'elysia';
import { userLogged } from './userLogged';
import { DomainDoesNotExistError, ResourceNotFoundError } from '../errors';
import { experienceRequest, objectIdParams } from '../models/elysia';

export const experiences = new Elysia()
  .use(userLogged)
  .post('/experiences', async ({ body, userId }) => {
    const domain = await Domain.findOne({ admin: userId });

    if (!domain) throw new DomainDoesNotExistError('You do not own a domain');

    const experience = await Experience.fromRequest(body);

    const result = await experience.save();

    domain.experiences.push(result._id)

    await domain.save();

    // Same shape as GET /domain/:name so the client can render it directly
    await result.populate(EXPERIENCE_POPULATE);
    return result.toObject();
  },
    {
      body: experienceRequest,
      detail: {
        summary: 'Add new experience'
      }
    })
  .put('/experiences/:id', async ({ body, userId, params: { id } }) => {
    const domain = await Domain.findOne({ admin: userId });

    if (!domain) throw new DomainDoesNotExistError('You do not own a domain');

    if (!domain.experiences.some((expId) => expId.toString() === id)) {
      throw new ResourceNotFoundError('Experience not found in your domain')
    }

    const experience = await Experience.findById(id);

    if (!experience) throw new ResourceNotFoundError('Experience not found')

    experience.set({
      title: body.title,
      summary: body.summary,
      type: body.type,
      company: await Company.findOrCreate(body.company),
      icon: body.icon,
      projects: await projectsFromRequest(body.projects),
    });

    const result = await experience.save();

    await result.populate(EXPERIENCE_POPULATE);
    return result.toObject();
  },
    {
      params: objectIdParams,
      body: experienceRequest,
      detail: {
        summary: 'Edit experience'
      }
    })
