import { persisted } from "svelte-persisted-store";
import type { User } from "portfolio-api/models/database/user";
import type { Writable } from "svelte/store";

type AuthenticationData = {
  user?: User & Record<string, unknown>,
  expires?: number
}

let initialAuth: AuthenticationData = {
  user: undefined,
  expires: undefined
}

export const authenticationStore: Writable<AuthenticationData> = persisted('authenticationStore', initialAuth);
