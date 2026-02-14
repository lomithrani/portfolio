import Elysia, { t } from 'elysia';
import { Experience, Domain } from '../models/database';
import { DomainDoesNotExistError } from '../errors';
import { corsConf } from './corsConf';
import { userLogged } from './userLogged';

const domainPublic = new Elysia()
  .get('/domain/:name', async ({ params: { name } }) => {
    const domain = await Domain.findOne({ name: name });
    if (!domain) throw new DomainDoesNotExistError('Domain not found');
    const populatedDomain = await domain.populate<{ experiences: Experience[] }>({
      path: 'experiences',
      populate: {
        path: 'projects',
        populate: [
          { path: 'hardSkills.skill' },
          { path: 'softSkills.skill' }
        ],
      },
    })
    return populatedDomain.toObject<Omit<Domain, "experiences"> & {
      experiences: Experience[];
    }>()
  })

const domainAdmin = new Elysia()
  .use(corsConf())
  .use(userLogged)
  .put('/domain/:name', async ({ params: { name }, body, userId }) => {
    const domain = await Domain.findOne({ name });
    if (!domain) throw new DomainDoesNotExistError('Domain not found');

    if (domain.admin.toString() !== userId) {
      throw new Error('Unauthorized: not the domain admin');
    }

    if (body.theme !== undefined) domain.theme = body.theme;
    if (body.headerTitle !== undefined) domain.headerTitle = body.headerTitle;
    if (body.headerSubtitle !== undefined) domain.headerSubtitle = body.headerSubtitle;
    if (body.defaultDarkMode !== undefined) domain.defaultDarkMode = body.defaultDarkMode;

    await domain.save();

    return domain.toObject();
  }, {
    body: t.Object({
      theme: t.Optional(t.String()),
      headerTitle: t.Optional(t.String()),
      headerSubtitle: t.Optional(t.String()),
      defaultDarkMode: t.Optional(t.Boolean())
    })
  })

export const domain = new Elysia()
  .use(domainPublic)
  .use(domainAdmin)
