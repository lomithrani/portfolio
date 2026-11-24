import { t } from 'elysia';

// GET /skills/search: what was typed in a skill field so far. Its length is
// checked by the route on the text as it is searched (portfolio-common's
// skillSearchText and canSearchSkill), which answers in the request's language
export const skillSearchQuery = t.Object({
  q: t.String({ description: 'What was typed: 1 to 100 characters once trimmed' })
});
