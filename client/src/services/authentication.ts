import { writable, derived } from "svelte/store";
import type { UserRole } from "portfolio-common";


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

// Check if we're running on client-side
if (typeof window !== "undefined") {
  try {
    initialAuth = JSON.parse(localStorage.getItem("auth") ?? "") as AuthTracker;
  } catch (e) {
    console.error("Could not parse roles from localStorage", e);
  }
}

export const authTracker = writable(initialAuth);

// Make sure to update localStorage only in client-side
if (typeof window !== "undefined") {
  authTracker.subscribe(val => {
    try {
      localStorage.setItem("auth", JSON.stringify(val));
    } catch (e) {
      console.error("Could not store auth to localStorage", e);
    }
  });
}

export const hasOneOf = derived(authTracker, $authTracker => (roles: UserRole[]) => $authTracker.roles?.some(role => roles.includes(role)) || false);
