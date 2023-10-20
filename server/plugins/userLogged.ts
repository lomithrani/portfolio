import jwt from "@elysiajs/jwt";
import Elysia from "elysia";
import { corsConf } from "./corsConf";

export const userLogged = () => new Elysia()
  .use(corsConf())
  .use(jwt({
    name: 'jwt',
    secret: Bun.env.JWT_SECRET!,
    exp: '7d'
  })).derive(async ({ cookie: { auth }, jwt }) => {
    const user = await jwt.verify(auth.value);

    return {
      userId: user ? user.sub : undefined
    }
  })
  .onBeforeHandle(({ userId, set }) => {
    if (userId === undefined) {
      set.status = "Unauthorized";
      return { error: "No User" }
    }
  })
