import { localStorageStore } from "@skeletonlabs/skeleton";
import type { User } from "portfolio-api/models/database/user";
import type { Writable } from "svelte/store";
import type { Document } from 'mongoose'

type AuthenticationData = {
  user?: User & Document,
  expires?: number
}

let initialAuth: AuthenticationData = {
  user: undefined,
  expires: undefined
}

export const authenticationStore: Writable<AuthenticationData> = localStorageStore('authenticationStore', initialAuth);
