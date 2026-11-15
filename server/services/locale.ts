// The language of each request to the API, so every text it answers with (error messages,
// what a hiring journey step says, the lines of a meeting invitation) is in the visitor's.
//
// The client sends the site's language as `Accept-Language` (client/src/services/portfolio.ts);
// any other caller gets what its own header prefers, English by default. The language is kept
// for the whole request with AsyncLocalStorage: portfolio-common's getLocale() reads it, and
// so do the messages declared with defineMessages() (see docs/I18N.md).
import { AsyncLocalStorage } from 'node:async_hooks'
import { Elysia } from 'elysia'
import { DEFAULT_LOCALE, preferredLocale, setLocaleResolver, type Locale } from 'portfolio-common'

const storage = new AsyncLocalStorage<Locale>()

setLocaleResolver(() => storage.getStore() ?? DEFAULT_LOCALE)

/** The language a request asks for */
export const localeOfRequest = (request: Request): Locale =>
  preferredLocale(request.headers.get('accept-language')) ?? DEFAULT_LOCALE

/** Runs `run` with `locale` as the language in use, whatever it awaits included */
export const runWithLocale = <T>(locale: Locale, run: () => T): T => storage.run(locale, run)

/** Wraps every request (hooks, handler and error handler) in its language */
export const locale = new Elysia({ name: 'locale' }).wrap((fn, request) => {
  const requested = localeOfRequest(request)
  return (...args: unknown[]) => runWithLocale(requested, () => fn(...args))
})
