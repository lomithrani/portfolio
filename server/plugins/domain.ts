import Elysia, { t } from 'elysia';
import { isValidDomainName, normalizeDomainName } from 'portfolio-common';
import { Experience, Domain, EXPERIENCE_POPULATE } from '../models/database';
import { consentRequest } from '../models/elysia';
import {
  DomainDoesNotExistError,
  DomainAlreadyExistsError,
  ForbiddenError,
  InvalidDomainNameError,
  UserAlreadyOwnsDomainError
} from '../errors';
import { userLogged } from './userLogged';
import { clientAddress } from '../services/clientAddress';
import { domainAvailability, limitDomainAvailabilityRequestsFromIp } from '../services/domainAvailability';
import { requireCurrentTerms } from '../services/legal';
import { isDuplicateKeyError } from '../services/mongoErrors';

/** Finds a domain by name, ignoring case: names are stored lowercase */
const findDomainByName = (name: string) => Domain.findOne({ name: normalizeDomainName(name) });

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
  // Whether a name can still be claimed, for the claim forms' live hint.
  // Advisory only (POST /domain/claim decides): one indexed lookup, nothing
  // about the owner. Rate limited per IP, as it is public
  .get('/domain/:name/availability', async ({ params: { name }, request, server }) => {
    await limitDomainAvailabilityRequestsFromIp(clientAddress(request, server));
    return await domainAvailability(name);
  }, {
    params: t.Object({ name: t.String({ maxLength: 255 }) }),
    detail: {
      summary: 'Whether a portfolio name is free to claim (advisory: the claim decides)'
    }
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

    // A portfolio is published under the Terms of use in force: an account
    // that has not accepted them sends its confirmation with the claim
    // (recorded from 'claim'), or gets a 422 on `consent`. Only claims are
    // gated: portfolios claimed before the terms existed stay online
    await requireCurrentTerms(userId, body.consent, 'claim');

    const existing = await Domain.findOne({ name });
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
      name: t.String({ maxLength: 255 }),
      // The age and terms confirmation, for an account that has not accepted
      // the terms in force yet
      consent: t.Optional(consentRequest)
    })
  })

export const domain = new Elysia()
  .use(domainPublic)
  .use(domainAdmin)
  .use(domainClaim)
