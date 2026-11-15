// The language of each page request (portfolio-common's i18n): what the URL asks for (`?lang=fr`),
// else the visitor's saved choice (the `lang` cookie), else what their browser prefers, else
// English. Kept for the whole request with AsyncLocalStorage, so everything rendered and every
// call to the API during it reads the same language through getLocale(). See docs/I18N.md.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Handle } from '@sveltejs/kit/hooks';
import {
	DEFAULT_LOCALE,
	LOCALE_COOKIE,
	LOCALE_COOKIE_MAX_AGE,
	LOCALE_PARAM,
	parseLocale,
	requestLocale,
	setLocaleResolver,
	type Locale
} from 'portfolio-common';

const storage = new AsyncLocalStorage<Locale>();

setLocaleResolver(() => storage.getStore() ?? DEFAULT_LOCALE);

export const handle: Handle = ({ event, resolve }) => {
	const asked = parseLocale(event.url.searchParams.get(LOCALE_PARAM));
	const saved = event.cookies.get(LOCALE_COOKIE);
	const locale = requestLocale({
		param: asked,
		cookie: saved,
		acceptLanguage: event.request.headers.get('accept-language')
	});
	// Only a language someone asked for is saved (the language switch is a link with `?lang=`):
	// a visitor who never chose keeps following their browser, with no cookie
	if (asked && saved !== asked) {
		event.cookies.set(LOCALE_COOKIE, asked, {
			path: '/',
			maxAge: LOCALE_COOKIE_MAX_AGE,
			sameSite: 'lax',
			// The page's script does not need it: it reads the language off <html lang>
			httpOnly: true
		});
	}
	event.locals.locale = locale;

	return storage.run(locale, async () => {
		const response = await resolve(event, {
			// app.html says lang="en"; the browser reads the page's language from there
			// (hooks.client.ts)
			transformPageChunk: ({ html }) => html.replace('<html lang="en"', `<html lang="${locale}"`)
		});
		if (response.headers.get('content-type')?.startsWith('text/html')) {
			response.headers.set('content-language', locale);
			// The same URL is answered in the visitor's language
			response.headers.append('vary', 'Accept-Language, Cookie');
		}
		return response;
	});
};
