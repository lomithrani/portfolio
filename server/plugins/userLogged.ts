import jwt from "@elysiajs/jwt";
import Elysia from "elysia";
import { corsConf } from "./corsConf";
import { AuthExpiredError, CouldntVerifyJwtError, MissingAuthCookieError, SubMissingError } from "../errors";

export const userLogged = () => new Elysia({ name: 'userLogged' })
  .use(corsConf())
  .use(jwt({
    name: 'jwt',
    secret: Bun.env.JWT_SECRET!,
    exp: '7d'
  })).derive(async ({ cookie: { auth }, jwt }) => {

    if (!auth.value) throw new MissingAuthCookieError("Unauthorized")

    const user = await jwt.verify(auth.value as string)

    if (!user) throw new CouldntVerifyJwtError("Unauthorized")

    if (!user.sub) throw new SubMissingError("Unauthorized")

    if (!user.exp || user.exp < (Date.now() / 1000)) throw new AuthExpiredError(`Unauthorized expired since ${new Date((user?.exp ?? 0) * 1000).toISOString()}`)

    return {
      userId: user.sub
    }
  });