// Renders the share images (1200×630) of the landing page and of a portfolio's pages, in English
// and French. Their texts are read from the messages of the pages they preview, so an image and
// its page cannot say different things:
// - landing: client/static/og-image.png and og-image-fr.png, the hero's headline over the steps
//   of a hiring journey, beside three of its promises (src/routes/(site)/page.messages.ts);
// - portfolio: og-portfolio.png and og-portfolio-fr.png, the picture of every portfolio's
//   experiences page: what a skill shows there, over a timeline (src/services/linkPreview.messages.ts);
// - hire: og-hire.png and og-hire-fr.png, the picture of every page for recruiters: its steps,
//   one or several, that open one after the other (linkPreview.messages.ts).
// The files of a portfolio's pictures are the ones its pages name (PREVIEW_IMAGES of
// src/services/linkPreview.ts).
// Render them again when one of those texts changes:
//
//   bun scripts/og-image/render.mjs                  # from client/: every image; needs the Inter font installed
//   bun scripts/og-image/render.mjs portfolio hire   # only these
//
// OG_CHROMIUM is the browser to launch when Playwright's own is not installed.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { withLocale } from 'portfolio-common';
import { richParts } from '../../src/lib/i18n/rich.ts';
import { m } from '../../src/routes/(site)/page.messages.ts';
import { landingImageSide } from '../../src/routes/(site)/shareImage.ts';
import { PREVIEW_IMAGES } from '../../src/services/linkPreview.ts';
import { m as preview } from '../../src/services/linkPreview.messages.ts';
import { m as skillPreview } from '../../src/services/projectPreview.messages.ts';
import { formatMonthCount } from '../../src/services/experienceDates.ts';

const out = (name) => fileURLToPath(new URL(`../../static/${name}`, import.meta.url));
const logo = readFileSync(out('logo.svg'), 'utf8');

const escape = (text) =>
	text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const check = `<span class="check"><svg viewBox="0 0 20 20" width="18" height="18"><path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="#052e16" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
const arrow = `<span class="arrow">→</span>`;

/** A message's `<nowrap>` passages kept on one line, as the page shows them; the rest escaped */
const nowrapHtml = (text) =>
	richParts(text)
		.map(({ tag, text }) =>
			tag === 'nowrap' ? `<b class="nowrap">${escape(text)}</b>` : escape(text)
		)
		.join('');

/**
 * The page every image is drawn on: the brand, a headline with its accent (`accentHtml` when it
 * holds markup, else `accent`, escaped), then `row`
 */
const page = (locale, { headline, accent, accentHtml, size, row, style = '' }) => `<!doctype html>
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
	h1 { margin-top: auto; font-size: ${size.headline}px; line-height: 1.16; font-weight: 800; letter-spacing: -0.02em; }
	h1 span { display: block; background: linear-gradient(90deg, #60a5fa, #a5b4fc 70%, #c4b5fd); -webkit-background-clip: text; color: transparent; }
	h1 .nowrap { white-space: nowrap; font-weight: inherit; }
	.row { margin-top: ${size.rowGap ?? 64}px; display: flex; align-items: center; justify-content: space-between; gap: 40px; }
	.journey {
		display: flex; align-items: center; gap: ${size.gap}px; padding: 18px 20px; white-space: nowrap;
		border: 1px solid rgb(255 255 255 / 0.16); border-radius: 22px; background: rgb(255 255 255 / 0.05);
		font-size: ${size.journey}px; font-weight: 600;
	}
	.step { display: inline-flex; align-items: center; gap: 10px; }
	.check { display: inline-flex; width: 28px; height: 28px; border-radius: 50%; background: #22c55e; align-items: center; justify-content: center; }
	.arrow { color: rgb(255 255 255 / 0.45); font-weight: 400; }
	.side { text-align: right; font-size: ${size.side}px; line-height: 1.65; color: rgb(255 255 255 / 0.78); white-space: nowrap; }
	.side div { ${size.sideWidth ? `max-width: ${size.sideWidth}px; white-space: normal; text-wrap: balance; line-height: 1.35; margin-top: 6px;` : ''} }
	${style}
</style>
<body>
	<div class="brand">${logo}Portfolio</div>
	<h1>${escape(headline)}<span>${accentHtml ?? escape(accent)}</span></h1>
	<div class="row">${row}</div>
</body>
</html>`;

const side = (lines) =>
	`<div class="side">${lines.map((line) => `<div>${escape(line)}</div>`).join('')}</div>`;

/** Each image: its file per language, and its page in a language (read inside withLocale) */
const TEMPLATES = {
	landing: {
		files: { en: 'og-image.png', fr: 'og-image-fr.png' },
		/** What the image says besides the headline */
		text: {
			en: {
				steps: ['Note', 'Job', 'Match'],
				last: 'Book a meeting',
				size: { headline: 60, journey: 19, side: 21, gap: 14 }
			},
			fr: {
				// The glossary's words (docs/I18N.md), longer than the English: smaller, to fit the row
				steps: ['Note', 'Offre', 'Correspondance'],
				last: 'Rendez-vous',
				size: { headline: 48, journey: 16, side: 17, sideWidth: 280, gap: 10 }
			}
		},
		/** Beside the journey: three of the page's promises, as it words them (and their alt text) */
		side: landingImageSide,
		html(locale) {
			const t = this.text[locale];
			const steps = t.steps
				.map(
					(step, index) =>
						`<span class="step">${check}${escape(step)}${index === 2 ? ' <b>86/100</b>' : ''}</span>${arrow}`
				)
				.join('');
			return page(locale, {
				headline: m.hero.headline,
				accentHtml: nowrapHtml(m.hero.headlineAccent),
				size: t.size,
				row: `<div class="journey">${steps}<span class="last"><i>4</i>${escape(t.last)}</span></div>${side(this.side())}`,
				style: `
	.step b { color: #86efac; font-weight: 700; }
	.last { display: inline-flex; align-items: center; gap: 10px; padding: 10px 16px 10px 10px; border-radius: 999px; background: #1d4ed8; }
	.last i { display: inline-flex; width: 28px; height: 28px; border-radius: 50%; background: #fff; color: #1d4ed8; align-items: center; justify-content: center; font-style: normal; font-size: 16px; font-weight: 700; }`
			});
		}
	},
	portfolio: {
		files: PREVIEW_IMAGES.portfolio,
		size: {
			en: { headline: 48, side: 21, rowGap: 44 },
			fr: { headline: 42, side: 20, rowGap: 44 }
		},
		html(locale) {
			// A timeline of three experiences (one lane each) and their projects, the three using the
			// skill outlined, with the line the page shows for that skill (projectPreview.messages.ts)
			const lanes = [
				{
					left: 0,
					width: 44,
					projects: [
						[6, 42, true],
						[56, 36, false]
					]
				},
				{
					left: 38,
					width: 62,
					projects: [
						[5, 30, true],
						[42, 26, false],
						[74, 22, true]
					]
				},
				{ left: 10, width: 22, projects: [[10, 70, false]] }
			]
				.map(
					({ left, width, projects }) =>
						`<div class="lane"><i class="bar" style="left:${left}%;width:${width}%">${projects
							.map(
								([at, length, used]) =>
									`<b class="${used ? 'used' : ''}" style="left:${at}%;width:${length}%"></b>`
							)
							.join('')}</i></div>`
				)
				.join('');
			const ticks = Array.from({ length: 7 }, () => '<span></span>').join('');
			const used = skillPreview.usedIn(3, formatMonthCount(50));
			return page(locale, {
				headline: preview.portfolio.headline,
				accent: preview.portfolio.accent,
				size: this.size[locale],
				row: `<div class="timeline"><div class="chip"><span class="dot"></span>${escape(used)}</div>${lanes}<div class="axis">${ticks}</div></div>${side(preview.portfolio.side)}`,
				style: `
	h1 span { text-wrap: balance; }
	.timeline {
		width: 580px; padding: 16px 20px 14px; display: flex; flex-direction: column; gap: 9px;
		border: 1px solid rgb(255 255 255 / 0.16); border-radius: 22px; background: rgb(255 255 255 / 0.05);
	}
	.chip {
		align-self: flex-start; display: inline-flex; align-items: center; gap: 10px; padding: 7px 14px;
		border-radius: 999px; background: rgb(134 239 172 / 0.14); border: 1px solid rgb(134 239 172 / 0.45);
		color: #bbf7d0; font-size: 17px; font-weight: 600; white-space: nowrap;
	}
	.dot { width: 10px; height: 10px; border-radius: 50%; background: #86efac; }
	.lane { position: relative; height: 24px; }
	.bar { position: absolute; top: 0; bottom: 0; border-radius: 999px; background: rgb(96 165 250 / 0.32); border: 1px solid rgb(147 197 253 / 0.45); }
	.lane:nth-child(3) .bar { background: rgb(45 212 191 / 0.28); border-color: rgb(94 234 212 / 0.45); }
	.lane:nth-child(4) .bar { background: rgb(165 180 252 / 0.28); border-color: rgb(199 210 254 / 0.45); }
	.bar b { position: absolute; top: 6px; bottom: 6px; border-radius: 999px; background: rgb(255 255 255 / 0.28); }
	.bar b.used { top: 4px; bottom: 4px; background: #86efac; box-shadow: 0 0 0 2px rgb(5 8 22 / 0.6), 0 0 0 4px #86efac; }
	.axis { display: flex; justify-content: space-between; border-top: 1px solid rgb(255 255 255 / 0.25); padding-top: 0; }
	.axis span { width: 1px; height: 7px; background: rgb(255 255 255 / 0.35); }`
			});
		}
	},
	hire: {
		files: PREVIEW_IMAGES.hire,
		size: {
			en: { headline: 56, journey: 20, side: 21, gap: 14 },
			fr: { headline: 50, journey: 19, side: 20, gap: 12 }
		},
		html(locale) {
			// No step is named (every journey has its own), and none is locked or counted: the first
			// open, the next ones faded, as a journey may have only the one (the default meeting)
			const step = preview.hire.step;
			const journey = [
				`<span class="step open"><i>1</i>${escape(step(1))}</span>`,
				`<span class="step maybe">${escape(step(2))}</span>`,
				`<span class="step maybe">${escape(step(3))}</span>`
			].join(arrow);
			return page(locale, {
				headline: preview.hire.headline,
				accent: preview.hire.accent,
				size: this.size[locale],
				row: `<div class="journey">${journey}</div>${side(preview.hire.side)}`,
				style: `
	.open { padding: 10px 16px 10px 10px; border-radius: 999px; background: #1d4ed8; }
	.open i { display: inline-flex; width: 28px; height: 28px; border-radius: 50%; background: #fff; color: #1d4ed8; align-items: center; justify-content: center; font-style: normal; font-size: 16px; font-weight: 700; }
	.maybe { padding: 9px 16px; border-radius: 999px; border: 1.5px dashed rgb(255 255 255 / 0.3); color: rgb(255 255 255 / 0.5); }
	.maybe:last-child { opacity: 0.6; }`
			});
		}
	}
};

const asked = process.argv.slice(2);
const unknown = asked.filter((name) => !(name in TEMPLATES));
if (unknown.length) {
	console.error(
		`Unknown image: ${unknown.join(', ')} (one of ${Object.keys(TEMPLATES).join(', ')})`
	);
	process.exit(1);
}

const browser = await chromium.launch({ executablePath: process.env.OG_CHROMIUM || undefined });
const tab = await browser.newPage({
	viewport: { width: 1200, height: 630 },
	deviceScaleFactor: 1
});
for (const name of asked.length ? asked : Object.keys(TEMPLATES)) {
	const template = TEMPLATES[name];
	for (const [locale, file] of Object.entries(template.files)) {
		await tab.setContent(
			withLocale(locale, () => template.html(locale)),
			{ waitUntil: 'load' }
		);
		await tab.evaluate(() => document.fonts.ready);
		await tab.screenshot({ path: out(file) });
		console.log(`static/${file}`);
	}
}
await browser.close();
