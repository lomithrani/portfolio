import { Experience } from '../models';
import { UserRole } from 'portfolio-common';
import Elysia from 'elysia';
import { validateUserRole } from './validateUserRole';

export const experiences = new Elysia()
  .use(validateUserRole([UserRole.Recruiter]))
  .get('/experiences', async () => await Experience.find());