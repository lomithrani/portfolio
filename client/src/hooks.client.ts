// The language of the page in the browser: the one the server rendered it in, which it wrote on
// <html lang> (hooks.server.ts). It does not change while the page lives: choosing another
// language is a link with `?lang=`, which loads the page again. See docs/I18N.md.
import { DEFAULT_LOCALE, parseLocale, setLocaleResolver } from 'portfolio-common';

const locale = parseLocale(document.documentElement.lang) ?? DEFAULT_LOCALE;

setLocaleResolver(() => locale);
