// Renders the landing page's share images (client/static/og-image.png in English,
// og-image-fr.png in French, 1200×630): the hero's headline, read from the landing page's
// messages so the image and the page cannot say different things, over the steps of a hiring
// journey. Render them again when the headline changes:
//
//   bun scripts/og-image/render.mjs              # from client/; needs the Inter font installed
//
// OG_CHROMIUM is the browser to launch when Playwright's own is not installed.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { withLocale } from 'portfolio-common';
import { plainText } from '../../src/lib/i18n/rich.ts';
import { m } from '../../src/routes/(site)/page.messages.ts';

const out = (name) => fileURLToPath(new URL(`../../static/${name}`, import.meta.url));
const logo = readFileSync(out('logo.svg'), 'utf8');

/** What the image says besides the headline */
const TEXT = {
	en: {
		file: 'og-image.png',
		steps: ['Note', 'Job', 'Match'],
		last: 'Book a meeting',
		side: ['Free for talent', 'Pay · Remote · Commute · Skills', 'Only a match books a meeting'],
		size: { headline: 60, journey: 19, side: 21, gap: 14 }
	},
	fr: {
		file: 'og-image-fr.png',
		// The glossary's words (docs/I18N.md), longer than the English: smaller, to fit the row
		steps: ['Note', 'Offre', 'Correspondance'],
		last: 'Rendez-vous',
		side: [
			'Gratuit pour les talents',
			'Rémunération · Télétravail · Trajet',
			'Rendez-vous pour les bonnes offres'
		],
		size: { headline: 54, journey: 16, side: 18, gap: 10 }
	}
};

const escape = (text) =>
	text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const check = `<span class="check"><svg viewBox="0 0 20 20" width="18" height="18"><path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="#052e16" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
const arrow = `<span class="arrow">→</span>`;

const html = (locale) => {
	const t = TEXT[locale];
	const [headline, accent] = withLocale(locale, () => [
		m.hero.headline,
		plainText(m.hero.headlineAccent)
	]);
	const steps = t.steps
		.map(
			(step, index) =>
				`<span class="step">${check}${escape(step)}${index === 2 ? ' <b>86/100</b>' : ''}</span>${arrow}`
		)
		.join('');
	return `<!doctype html>
<html lang="${locale}">
<meta charset="utf-8" />
<style>
	* { box-sizing: border-box; margin: 0; }
	body {
		width: 1200px; height: 630px; overflow: hidden; color: #fff;
		font-family: Inter, sans-serif; font-feature-settings: 'ss01', 'cv11';
		background:
			radial-gradient(60rem 34rem at 12% -8%, #1d4ed8 0%, transparent 62%),
			radial-gradient(40rem 26rem at 78% -18%, #0f766e 0%, transparent 60%),
			radial-gradient(34rem 28rem at 100% 100%, #4338ca 0%, transparent 62%),
			#050816;
		padding: 72px 80px; display: flex; flex-direction: column;
	}
	.brand { display: flex; align-items: center; gap: 18px; font-size: 24px; font-weight: 700; }
	.brand svg { width: 56px; height: 56px; }
	h1 { margin-top: auto; font-size: ${t.size.headline}px; line-height: 1.16; font-weight: 800; letter-spacing: -0.02em; }
	h1 span { display: block; background: linear-gradient(90deg, #60a5fa, #a5b4fc 70%, #c4b5fd); -webkit-background-clip: text; color: transparent; }
	.row { margin-top: 64px; display: flex; align-items: center; justify-content: space-between; gap: 40px; }
	.journey {
		display: flex; align-items: center; gap: ${t.size.gap}px; padding: 18px 20px; white-space: nowrap;
		border: 1px solid rgb(255 255 255 / 0.16); border-radius: 22px; background: rgb(255 255 255 / 0.05);
		font-size: ${t.size.journey}px; font-weight: 600;
	}
	.step { display: inline-flex; align-items: center; gap: 10px; }
	.step b { color: #86efac; font-weight: 700; }
	.check { display: inline-flex; width: 28px; height: 28px; border-radius: 50%; background: #22c55e; align-items: center; justify-content: center; }
	.arrow { color: rgb(255 255 255 / 0.45); font-weight: 400; }
	.last { display: inline-flex; align-items: center; gap: 10px; padding: 10px 16px 10px 10px; border-radius: 999px; background: #1d4ed8; }
	.last i { display: inline-flex; width: 28px; height: 28px; border-radius: 50%; background: #fff; color: #1d4ed8; align-items: center; justify-content: center; font-style: normal; font-size: 16px; font-weight: 700; }
	.side { text-align: right; font-size: ${t.size.side}px; line-height: 1.65; color: rgb(255 255 255 / 0.78); white-space: nowrap; }
</style>
<body>
	<div class="brand">${logo}Portfolio</div>
	<h1>${escape(headline)}<span>${escape(accent)}</span></h1>
	<div class="row">
		<div class="journey">${steps}<span class="last"><i>4</i>${escape(t.last)}</span></div>
		<div class="side">${t.side.map((line) => `<div>${escape(line)}</div>`).join('')}</div>
	</div>
</body>
</html>`;
};

const browser = await chromium.launch({ executablePath: process.env.OG_CHROMIUM || undefined });
const page = await browser.newPage({
	viewport: { width: 1200, height: 630 },
	deviceScaleFactor: 1
});
for (const locale of Object.keys(TEXT)) {
	await page.setContent(html(locale), { waitUntil: 'load' });
	await page.evaluate(() => document.fonts.ready);
	await page.screenshot({ path: out(TEXT[locale].file) });
	console.log(`static/${TEXT[locale].file}`);
}
await browser.close();
