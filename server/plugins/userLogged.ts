import jwt from "@elysiajs/jwt";
import Elysia from "elysia";
import { corsConf } from "./corsConf";
import { CouldntVerifyJwtError, MissingAuthCookieError, SubMissingError } from "errors";

export const userLogged = () => new Elysia()
  .use(corsConf())
  .use(jwt({
    name: 'jwt',
    secret: Bun.env.JWT_SECRET!,
    exp: '7d'
  })).derive(async ({ cookie: { auth }, jwt }) => {

    if (!auth.value) throw new MissingAuthCookieError("Unauthorized")

    const user = await jwt.verify(auth.value)

    if (!user) throw new CouldntVerifyJwtError("Unauthorized")

    if (!user.sub) throw new SubMissingError("Unauthorized")

    return {
      userId: user.sub
    }
  });
