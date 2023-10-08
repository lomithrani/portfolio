import cors from "@elysiajs/cors";
import jwt from "@elysiajs/jwt";
import Elysia from "elysia";
import { UserRole } from "portfolio-common";

type validationType = 'OR' | 'AND';

export const validateUserRole = (roles: UserRole[], type: validationType = 'OR') => new Elysia()
  .use(cors({
    origin: (request: Request): boolean => {
      const origin = request.headers.get('origin');
      if (!origin) {
        return false;
      }
      const allowedOrigins = JSON.parse(Bun.env.ALLOWED_DOMAINS || '[]') as string[];
      return allowedOrigins.includes(origin);
    }
  }))
  .use(jwt({
    name: 'jwt',
    secret: Bun.env.JWT_SECRET!,
    exp: '7d'
  }))
  .onBeforeHandle(async ({ cookie: { auth }, jwt, set }) => {
    const user = await jwt.verify(auth.value);
    if (!user) {
      set.status = "Unauthorized"
      return false;
    }

    const jwtRoles = JSON.parse(user['roles'] ?? "[]") as UserRole[];

    switch (type) {
      case 'OR':
        if (roles.some(role => jwtRoles.includes(role))) {
          return;
        }
        break;
      case 'AND':
        if (roles.every(role => jwtRoles.includes(role))) {
          return;
        }
        break;

    }
    set.status = 'Unauthorized';
    return false;
  });