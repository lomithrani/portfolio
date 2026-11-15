import Elysia from 'elysia';
import { userLogged } from './userLogged';
import { addressSearchRequest, officePlaceRequest } from '../models/elysia';
import { officePlace, searchAddresses } from '../services/addressSearch';
import type { AddressSearchResult, OfficePlaceResult } from '../services/addressSearch';

// The address search of the forms that take an address
// (services/addressSearch.ts): the commute's address of a perfect job, the
// office of a job posting. For signed-in accounts only: what is typed goes
// to the map service from here, never from the browser.
//
// POST, though nothing is written: what is typed is an address, maybe
// someone's home, and a body is kept out of the traces (instrumentation.ts)
// and of the host's request logs, where a URL's query string is not
export const addresses = new Elysia()
  .use(userLogged)
  .post(
    '/addresses/search',
    async ({ userId, body }): Promise<AddressSearchResult> => await searchAddresses(userId, body),
    {
      body: addressSearchRequest,
      detail: { summary: 'The addresses that what was typed could be (advisory: saving looks the address up)' }
    }
  )
  .post(
    '/addresses/office',
    async ({ userId, body }): Promise<OfficePlaceResult> => await officePlace(userId, body),
    {
      body: officePlaceRequest,
      detail: { summary: "Where travel times to a job's office are counted from: its street, its town, or nowhere" }
    }
  );
