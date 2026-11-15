import { t } from 'elysia';
import { ADDRESS_SEARCH, JOB_LIMITS } from 'portfolio-common';

// POST /addresses/search: what was typed, and what narrows the search (the
// postal code and the town of a job posting, typed in their own fields).
// Longer than the search takes is cut, not refused: it is typed text
export const addressSearchRequest = t.Object({
  q: t.String({ maxLength: ADDRESS_SEARCH.maxLength * 2 }),
  postalCode: t.Optional(t.String({ maxLength: JOB_LIMITS.postalCode })),
  city: t.Optional(t.String({ maxLength: JOB_LIMITS.city }))
});

// POST /addresses/office: the office of a job posting as its editor holds it
export const officePlaceRequest = t.Object({
  address: t.Optional(t.String({ maxLength: JOB_LIMITS.address })),
  postalCode: t.Optional(t.String({ maxLength: JOB_LIMITS.postalCode })),
  city: t.Optional(t.String({ maxLength: JOB_LIMITS.city }))
});
