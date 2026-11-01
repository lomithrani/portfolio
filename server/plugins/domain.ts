import Elysia, { t } from 'elysia';
import { isValidDomainName, normalizeDomainName } from 'portfolio-common';
import { Experience, Domain, EXPERIENCE_POPULATE } from '../models/database';
import {
  DomainDoesNotExistError,
  DomainAlreadyExistsError,
  ForbiddenError,
  InvalidDomainNameError,
  UserAlreadyOwnsDomainError
} from '../errors';
import { userLogged } from './userLogged';
import { isDuplicateKeyError } from '../services/mongoErrors';

// Names are stored lowercase, but domains claimed before that may have
// uppercase letters: a case-insensitive match keeps them reachable.
const CASE_INSENSITIVE = { collation: { locale: 'en', strength: 2 } };

/** Finds a domain by name, ignoring case (exact lowercase match first) */
const findDomainByName = async (name: string) => {
  const normalized = normalizeDomainName(name);
  return (
    (await Domain.findOne({ name: normalized })) ??
    (await Domain.findOne({ name: normalized }, null, CASE_INSENSITIVE))
  );
};

const domainPublic = new Elysia()
  .get('/domain/:name', async ({ params: { name } }) => {
    const domain = await findDomainByName(name);
    if (!domain) throw new DomainDoesNotExistError('Domain not found');
    const populatedDomain = await domain.populate<{ experiences: Experience[] }>({
      path: 'experiences',
      populate: EXPERIENCE_POPULATE
    })
    return populatedDomain.toObject<Omit<Domain, "experiences"> & {
      experiences: Experience[];
    }>()
  })

const domainAdmin = new Elysia()
  .use(userLogged)
  .put('/domain/:name', async ({ params: { name }, body, userId }) => {
    const domain = await findDomainByName(name);
    if (!domain) throw new DomainDoesNotExistError('Domain not found');

    if (domain.admin.toString() !== userId) {
      throw new ForbiddenError('Forbidden: not the domain admin');
    }

    if (body.theme !== undefined) domain.theme = body.theme;
    if (body.headerTitle !== undefined) domain.headerTitle = body.headerTitle;
    if (body.headerSubtitle !== undefined) domain.headerSubtitle = body.headerSubtitle;
    if (body.defaultDarkMode !== undefined) domain.defaultDarkMode = body.defaultDarkMode;

    await domain.save();

    return domain.toObject();
  }, {
    body: t.Object({
      theme: t.Optional(t.String({ maxLength: 64 })),
      headerTitle: t.Optional(t.String({ maxLength: 200 })),
      headerSubtitle: t.Optional(t.String({ maxLength: 1000 })),
      defaultDarkMode: t.Optional(t.Boolean())
    })
  })

const domainClaim = new Elysia()
  .use(userLogged)
  .post('/domain/claim', async ({ body, userId }) => {
    const name = normalizeDomainName(body.name);
    // Same rules as the client: no reserved route names, no file-like names
    if (!isValidDomainName(name)) throw new InvalidDomainNameError('Invalid domain name');

    // Case-insensitive, so 'jane.doe' cannot shadow a legacy 'Jane.Doe'
    const existing = await Domain.findOne({ name }, null, CASE_INSENSITIVE);
    if (existing) throw new DomainAlreadyExistsError('Domain already exists');

    const ownedDomain = await Domain.findOne({ admin: userId });
    if (ownedDomain) throw new UserAlreadyOwnsDomainError('You already own a domain');

    try {
      const domain = await Domain.create({ name, admin: userId, experiences: [] });
      return domain.toObject();
    } catch (error) {
      // Lost a race against another claim of the same name
      if (isDuplicateKeyError(error)) throw new DomainAlreadyExistsError('Domain already exists');
      throw error;
    }
  }, {
    body: t.Object({
      name: t.String({ maxLength: 255 })
    })
  })

export const domain = new Elysia()
  .use(domainPublic)
  .use(domainAdmin)
  .use(domainClaim)
