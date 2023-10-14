import jwt from "@elysiajs/jwt";
import Elysia from "elysia";
import { corsConf } from "./corsConf";

export const userLogged = () => new Elysia()
  .use(corsConf())
  .use(jwt({
    name: 'jwt',
    secret: Bun.env.JWT_SECRET!,
    exp: '7d'
  }))
  .onBeforeHandle(async ({ cookie: { auth }, jwt, set }) => {
    const user = await jwt.verify(auth.value);
    if (!user) {
      set.status = "Unauthorized"
      return { error: "No User" };
    }
  });