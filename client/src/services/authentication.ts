import { portfolioApi } from '$services';
import type { Domain } from 'portfolio-api/models/database';
import { authenticationStore } from './stores'
import { get } from 'svelte/store';


const isLogged: () => Promise<boolean> = async () => {
  const authentication = get(authenticationStore);

  if (authentication.user && authentication.expires) {
    return Date.now() < (authentication.expires * 1000);
  }

  const isLoggedResponse = await portfolioApi.isLogged.get({ $fetch: { credentials: 'include' } });

  if ((isLoggedResponse.data?.expires ?? 0) * 1000 > Date.now()) {
    console.log("already logged");
    return true;
  }

  return false;
}

const isDomainAdmin: (domain: Domain) => boolean = (domain) => {
  const authentication = get(authenticationStore);
  return authentication.user?._id == domain.admin;
}

const logout: () => void = async () => {
  await portfolioApi.logout.get({ $fetch: { credentials: 'include' } });
  authenticationStore.set({ expires: undefined, user: undefined });
}

const login: (googleCredentials: string) => Promise<boolean> = async (googleCredentials) => {

  const loginResponse = await portfolioApi.login.post({
    token: googleCredentials,
    $fetch: { credentials: 'include' }
  });

  if (loginResponse.data?.user) {

    if ('error' in loginResponse.data) {
      authenticationStore.set({ expires: undefined });
      return false;
    }

    const isloggedResponse = await portfolioApi.isLogged.get({
      $fetch: { credentials: 'include' }
    }); // confirm that cookie was properly set

    authenticationStore.set({
      user: loginResponse.data.user,
      expires: loginResponse.data.expires
    });
  }
  return true;
}

export { isLogged, isDomainAdmin, login, logout }