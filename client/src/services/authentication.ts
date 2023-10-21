import { localStorageStore } from "@skeletonlabs/skeleton";
import type { User } from "portfolio-api/models/database";
import type { Writable } from "svelte/store";
import type { Document } from 'mongoose'

type AuthTracker = {
  authenticated: boolean,
  user?: User & Document,
  expires?: Date
}

let initialAuth: AuthTracker = {
  authenticated: false,
  user: undefined,
  expires: undefined
}

export const authTracker: Writable<AuthTracker> = localStorageStore('authTracker', initialAuth);
