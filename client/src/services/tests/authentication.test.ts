import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted — cannot reference outer variables
vi.mock('$services', () => ({
  portfolioApi: {
    login: { post: vi.fn() },
    isLogged: { get: vi.fn() },
    logout: { get: vi.fn(() => Promise.resolve({ data: null })) },
  },
}));

// Mock svelte/store's get function and the persisted store
vi.mock('../stores', () => {
  let _value: Record<string, unknown> = { user: undefined, expires: undefined };
  return {
    authenticationStore: {
      set: vi.fn((val: Record<string, unknown>) => { _value = val; }),
      subscribe: vi.fn((fn: (val: unknown) => void) => {
        fn(_value);
        return () => {};
      }),
      // Expose for test manipulation
      _getValue: () => _value,
      _setValue: (val: Record<string, unknown>) => { _value = val; },
    },
  };
});

import { isLogged, isDomainAdmin, login, logout } from '../authentication';
import { authenticationStore } from '../stores';
import { portfolioApi } from '$services';

// Cast to access internal methods
const store = authenticationStore as any;
const mockLoginPost = portfolioApi.login.post as ReturnType<typeof vi.fn>;
const mockIsLoggedGet = portfolioApi.isLogged.get as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  store._setValue({ user: undefined, expires: undefined });
  // Re-wire subscribe to return current value
  store.subscribe.mockImplementation((fn: (val: unknown) => void) => {
    fn(store._getValue());
    return () => {};
  });
});

describe('isLogged', () => {
  it('should return true when store has valid non-expired auth', async () => {
    const futureExpires = (Date.now() / 1000) + 3600;
    store._setValue({ user: { _id: '123', email: 'test@test.com' }, expires: futureExpires });

    const result = await isLogged();
    expect(result).toBe(true);
    expect(mockIsLoggedGet).not.toHaveBeenCalled();
  });

  it('should call API when store is empty and update store on success', async () => {
    const futureExpires = (Date.now() / 1000) + 3600;
    mockIsLoggedGet.mockResolvedValue({
      data: {
        logged: true,
        user: { _id: '123', email: 'test@test.com' },
        expires: futureExpires,
      },
    });

    const result = await isLogged();
    expect(result).toBe(true);
    expect(mockIsLoggedGet).toHaveBeenCalledTimes(1);
    expect(store.set).toHaveBeenCalled();
  });

  it('should return false when store is empty and API returns expired', async () => {
    const pastExpires = (Date.now() / 1000) - 3600;
    mockIsLoggedGet.mockResolvedValue({
      data: { logged: false, expires: pastExpires },
    });

    const result = await isLogged();
    expect(result).toBe(false);
  });
});

describe('isDomainAdmin', () => {
  it('should return true when user._id matches domain.admin', () => {
    store._setValue({ user: { _id: 'admin-123' }, expires: 9999999999 });

    const domain = { admin: 'admin-123' } as any;
    expect(isDomainAdmin(domain)).toBe(true);
  });

  it('should return false when user._id does not match domain.admin', () => {
    store._setValue({ user: { _id: 'user-456' }, expires: 9999999999 });

    const domain = { admin: 'admin-123' } as any;
    expect(isDomainAdmin(domain)).toBe(false);
  });

  it('should return false when no user is logged in', () => {
    const domain = { admin: 'admin-123' } as any;
    expect(isDomainAdmin(domain)).toBe(false);
  });
});

describe('login', () => {
  it('should call API and update store on success', async () => {
    const futureExpires = (Date.now() / 1000) + 3600;
    mockLoginPost.mockResolvedValue({
      data: {
        user: { _id: '123', email: 'test@test.com' },
        expires: futureExpires,
      },
    });
    mockIsLoggedGet.mockResolvedValue({
      data: { logged: true, user: { _id: '123' }, expires: futureExpires },
    });

    const result = await login('google-cred-token');
    expect(result).toBe(true);
    expect(mockLoginPost).toHaveBeenCalledWith(
      { token: 'google-cred-token' },
      expect.objectContaining({ fetch: { credentials: 'include' } })
    );
    expect(store.set).toHaveBeenCalled();
  });
});

describe('logout', () => {
  it('should clear the store', async () => {
    await logout();
    expect(store.set).toHaveBeenCalledWith({
      expires: undefined,
      user: undefined,
    });
  });
});
