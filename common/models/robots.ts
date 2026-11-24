// What the site asks of search engines for a page or an answer they must not list: a portfolio's
// pages and the private pages of the web client (x-robots-tag header and robots meta,
// client/src/lib/robots.ts), and every answer of the API (X-Robots-Tag, server/app.ts). One value
// for both, so they cannot drift apart. It is a request, not a lock: robots.txt refuses nothing,
// since a crawler must fetch a page to read it.

/** Not listed, its links not followed, no cached copy */
export const ROBOTS_NOINDEX = 'noindex, nofollow, noarchive';
