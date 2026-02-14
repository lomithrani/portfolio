import { Domain, Experience, Skill } from '../models/database';
import { Project } from '../models/database/project';
import Elysia, { t } from 'elysia';
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

    const experience = await Experience.fromRequest(body);

    const result = await experience.save();

    if (!result) throw new CannotSaveExperienceError(userId)

    domain.experiences.push(result._id)

    await domain.save();

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

    if (!domain) throw new DomainDoesNotExistError(userId)

    if (!domain.experiences.some((expId) => expId.toString() === id)) {
      throw new Error('Experience not found in your domain')
    }

    const experience = await Experience.findById(id);

    if (!experience) throw new Error('Experience not found')

    const projects = [];
    for (const project of body.projects) {
      const hardSkills = await Promise.all(
        project.hardSkills.map(async (hs) => ({
          skill: await Skill.findOrCreate(hs.name),
          level: hs.level,
        }))
      );
      const softSkills = await Promise.all(
        project.softSkills.map(async (ss) => ({
          skill: await Skill.findOrCreate(ss.name),
          level: ss.level,
        }))
      );
      projects.push(new Project({ ...project, hardSkills, softSkills }));
    }

    experience.set({
      title: body.title,
      summary: body.summary,
      type: body.type,
      company: body.company,
      projects,
    });

    const result = await experience.save();

    if (!result) throw new CannotSaveExperienceError(userId)

    return result.toObject();
  },
    {
      body: experienceRequest,
      detail: {
        summary: 'Edit experience'
      }
    })

