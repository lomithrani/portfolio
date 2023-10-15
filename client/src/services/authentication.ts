import { localStorageStore } from "@skeletonlabs/skeleton";
import type { Types } from 'mongoose'
import type { Writable } from "svelte/store";

type AuthTracker = {
  authenticated: boolean,
  userId?: Types.ObjectId,
  expires?: Date
}

let initialAuth: AuthTracker = {
  authenticated: false,
  userId: undefined,
  expires: undefined
}

export const authTracker: Writable<AuthTracker> = localStorageStore('authTracker', initialAuth);
