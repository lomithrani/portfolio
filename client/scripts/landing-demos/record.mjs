// Records the landing page's two demos (client/static/landing/demo-style.* and demo-journey.*,
// played by components/landing/DemoVideo.svelte) against the real app running locally, on a
// phone-sized screen. Record them again when what they show changes (the experiences page, the
// Hire page, the job match):
//
//   bun run db:up && bun run db:seed
//   COMMUTE_TIMES=true bun run start:server      # the commute needs the travel times
//   bun run build:client && bun run start:client
//   bun scripts/landing-demos/seed.mjs           # from client/: the fictional candidate and recruiter
//   bun scripts/landing-demos/record.mjs         # needs ffmpeg with libvpx-vp9 and libx264
//
// DEMO_CHROMIUM is the browser to launch when Playwright's own is not installed. Google is never
// reached; the travel times are the API's (Géoplateforme), cached after the first run.
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { JANE, SAM, WEB, film, mongo, signIn } from './lib.mjs';

const out = fileURLToPath(new URL('../../static/landing/', import.meta.url));
const frames = path.join(os.tmpdir(), 'landing-demos');

const browser = await chromium.launch({ executablePath: process.env.DEMO_CHROMIUM || undefined });

/** A phone, at twice its size in pixels: the films are shown at about 300 px wide */
const phone = async (userId) => {
	const context = await browser.newContext({
		viewport: { width: 400, height: 720 },
		deviceScaleFactor: 2,
		colorScheme: 'light'
	});
	await context.route(
		/^https?:\/\/([^/]*\.)?(google|gstatic|googleapis|googleusercontent)\.com\//,
		(route) => route.abort()
	);
	if (userId) await signIn(context, userId);
	return context.newPage();
};

/** The experiences page in five themes, light and dark, as a list then as a timeline */
const style = async () => {
	const page = await phone();
	await page.goto(`${WEB}/jane.doe/experiences`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(600);
	const f = await film(page, path.join(frames, 'style'));
	// What the portfolio's layout does with the theme and the mode its owner saved
	const look = (theme, dark = false) =>
		page.evaluate(
			([theme, dark]) => {
				document.documentElement.dataset.theme = theme;
				document.documentElement.classList.toggle('dark', dark);
				document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
			},
			[theme, dark]
		);

	await f.hold(1400);
	await f.scroll(250, 700);
	await f.hold(500);
	await look('rose');
	await f.hold(1200);
	await look('mint', true);
	await f.hold(1200);
	await f.tap(page.getByRole('button', { name: 'Timeline' }));
	await page.waitForTimeout(900);
	await f.hold(900);
	const zoomOut = page.getByRole('button', { name: 'Zoom out' });
	await f.tap(zoomOut);
	await page.waitForTimeout(300);
	await f.hold(350);
	await zoomOut.click();
	await page.waitForTimeout(300);
	await f.hold(350);
	await zoomOut.click();
	await page.waitForTimeout(300);
	await f.hold(900);
	await look('seafoam');
	await f.hold(1300);
	await f.tap(page.getByRole('button', { name: /Senior frontend engineer/ }).first());
	await page.waitForTimeout(600);
	await f.hold(1200);
	await look('catppuccin', true);
	await f.hold(1600);
	f.save(path.join(out, 'demo-style'));
	await page.context().close();
};

/** A recruiter goes through the journey with a job too far away: the commute is a deal-breaker */
const journey = async () => {
	// The recruiter starts the journey again
	mongo(`db.workflowinstances.deleteMany({ owner: ObjectId('${JANE}') })`);
	const page = await phone(SAM);
	await page.goto(`${WEB}/jane.doe/hire`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(600);
	const f = await film(page, path.join(frames, 'journey'));
	const heading = (name) => page.getByRole('heading', { name });
	// The toast of a step that was confirmed would cover what the next one shows
	const settle = async () => {
		await page.waitForTimeout(900);
		const close = page.getByRole('region', { name: /^Notifications/ }).getByRole('button');
		if (await close.count()) await close.first().click();
		await page.waitForTimeout(300);
	};

	await f.hold(1500);
	await f.tap(page.getByRole('button', { name: 'I have read this' }));
	await settle();
	await f.hold(500);
	await f.scroll(await f.topOf(heading('Select or create a job'), 90), 600);
	await f.hold(900);
	await f.tap(page.getByRole('button', { name: 'Continue with this job' }));
	await settle();
	await f.hold(500);
	await f.scroll(await f.topOf(heading('Match the perfect job'), 20), 700);
	await f.hold(1500);
	await f.scroll(await f.topOf(page.locator('[id$="-score"]'), 14), 800);
	await f.hold(3400);
	f.save(path.join(out, 'demo-journey'));
	await page.context().close();
};

await style();
await journey();
await browser.close();
