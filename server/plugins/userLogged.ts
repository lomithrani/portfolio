import jwt from "@elysiajs/jwt";
import Elysia from "elysia";
import { env } from "../env";
import { AuthExpiredError, CouldntVerifyJwtError, MissingAuthCookieError, SubMissingError } from "../errors";

// Returns a new instance on purpose: `.use(userLogged)` continues the caller's
// chain on this instance, so its derive guards every route declared after it
export const userLogged = () => new Elysia({ name: 'userLogged' })
  .use(jwt({
    name: 'jwt',
    secret: env.JWT_SECRET,
    exp: '7d'
  })).derive(async ({ cookie: { auth }, jwt }) => {

    if (!auth.value) throw new MissingAuthCookieError("Unauthorized")

    const user = await jwt.verify(auth.value as string)

    if (!user) throw new CouldntVerifyJwtError("Unauthorized")

    if (!user.sub) throw new SubMissingError("Unauthorized")

    if (!user.exp || user.exp < (Date.now() / 1000)) throw new AuthExpiredError("Unauthorized: session expired")

    return {
      userId: user.sub
    }
  });
