import { test, expect, mock, describe, it, beforeAll, beforeEach, } from 'bun:test'
import { app } from '..';
import { User } from '../models/database';
import { jwtDecode } from 'jwt-decode';

const baseUrl = `http://localhost:${app.server?.port}`;
const testEmail = 'bob@gmail.com';
const sevenDaysMinusOneSecond = 1000 * 60 * 60 * 24 * 7 - 1000;

const parseCookie = (str: string) =>
  str
    .split(";")
    .map((v) => v.split("="))
    .reduce((acc, v) => {
      acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(v[1]?.trim() ?? true);
      return acc;
    }, {} as { [key: string]: string });

describe("login", () => {

  beforeEach(async () => {
    const init = { status: 200, statusText: 'OK', ok: true, headers: { 'Content-Type': 'application/json' } };
    const myResponse = new Response(JSON.stringify({ email_verified: true, email: testEmail }), init);
    global.fetch = mock(() => Promise.resolve(myResponse));
  });

  it('Should create new user', async () => {
    await User.deleteOne({ email: testEmail });
    var user = await User.findOne({ email: testEmail });
    expect(user).toBeNull();

    const result = await app.fetch(new Request(`${baseUrl}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token: '123' })
    }));

    const authToken = parseCookie(result.headers.get('Set-Cookie') ?? '')['auth']

    const userFromToken = jwtDecode(authToken);

    expect(result.status).toBe(200);

    const response: { user: User, expires: number } = await result.json();

    expect(Math.abs(userFromToken.exp! - response.expires)).toBeLessThan(1);
    expect(response.user.email).toBe(testEmail);
    expect(response.expires).toBeGreaterThan((Date.now() + sevenDaysMinusOneSecond) / 1000);
  });

  it('Should return existing user', async () => {
    var user = await User.findOne({ email: testEmail });
    expect(user).not.toBeNull();

    const result = await app.fetch(new Request(`${baseUrl}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token: '123' })
    }));

    expect(result.status).toBe(200);

    const response: { user: User, expires: number } = await result.json();

    expect(response.user.email).toBe(testEmail);
    expect(response.expires).toBeGreaterThan((Date.now() + sevenDaysMinusOneSecond) / 1000);
  });
});
