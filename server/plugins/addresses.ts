import Elysia from 'elysia';
import { userLogged } from './userLogged';
import { addressSearchQuery, officePlaceQuery } from '../models/elysia';
import { officePlace, searchAddresses } from '../services/addressSearch';
import type { AddressSearchResult, OfficePlaceResult } from '../services/addressSearch';

// The address search of the forms that take an address
// (services/addressSearch.ts): the commute's address of a perfect job, the
// office of a job posting. For signed-in accounts only: what is typed goes
// to the map service from here, never from the browser.
export const addresses = new Elysia()
  .use(userLogged)
  .get(
    '/addresses/search',
    async ({ userId, query }): Promise<AddressSearchResult> => await searchAddresses(userId, query),
    {
      query: addressSearchQuery,
      detail: { summary: 'The addresses that what was typed could be (advisory: saving looks the address up)' }
    }
  )
  .get(
    '/addresses/office',
    async ({ userId, query }): Promise<OfficePlaceResult> => await officePlace(userId, query),
    {
      query: officePlaceQuery,
      detail: { summary: "Where travel times to a job's office are counted from: its street, its town, or nowhere" }
    }
  );
