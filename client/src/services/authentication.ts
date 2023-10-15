import { type Writable, derived } from "svelte/store";
import type { UserRole } from "portfolio-common";
import { localStorageStore } from "@skeletonlabs/skeleton";


type AuthTracker = {
  authenticated: boolean,
  roles?: UserRole[],
  expires?: Date
}

let initialAuth: AuthTracker = {
  authenticated: false,
  roles: [],
  expires: undefined
}

export const authTracker: Writable<AuthTracker> = localStorageStore('storeExample', initialAuth);

export const hasOneOf = derived(authTracker, $authTracker => (roles: UserRole[]) => $authTracker.roles?.some(role => roles.includes(role)) || false);
