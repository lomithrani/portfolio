import Elysia from 'elysia';
import { userLogged } from './userLogged';
import { skillSearchQuery } from '../models/elysia';
import { searchSkills } from '../services/skillSearch';
import type { SkillSearchResult } from '../services/skillSearch';

// The skill search of the experience editor (services/skillSearch.ts): the
// skills of the site's catalogue that what an owner types could be. For
// signed-in accounts only, and only skills recognised as skills: a name
// someone typed is never shown to another account before that.
//
// A GET: what is typed is the name of a technology or a soft skill, nothing
// of the person; traces drop every query string all the same
// (instrumentation.ts), and nothing here logs it
export const skills = new Elysia()
  .use(userLogged)
  .get(
    '/skills/search',
    async ({ userId, query: { q } }): Promise<SkillSearchResult> => await searchSkills(userId, q),
    {
      query: skillSearchQuery,
      detail: { summary: 'The skills of the catalogue that what was typed could be (suggestions: any name can be saved)' }
    }
  );
