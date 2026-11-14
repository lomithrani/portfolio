// Shared by the seed and the recorder of the landing page's demos (see record.mjs): who is who,
// their sessions, and the frame-by-frame film of a page.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** The local API and web app (`bun run start:server`, `bun run start:client`) */
export const API = process.env.PUBLIC_PORTFOLIO_API_URL ?? 'http://localhost:3000';
export const WEB = process.env.DEMO_WEB_URL ?? 'http://localhost:4000';
/** The fictional candidate (domain 'jane.doe') and recruiter of the demos: fixed ids */
export const JANE = '65de00000000000000000001';
export const SAM = '65de00000000000000000002';
/** The API's JWT_SECRET (server/.env.example's by default) */
const SECRET = process.env.JWT_SECRET ?? 'change-me';

/** Runs a script in the local MongoDB of compose.yaml (`bun run db:up`) */
export const mongo = (script) =>
	execFileSync(
		'docker',
		['exec', 'portfolio-mongo-1', 'mongosh', '--quiet', 'portfolio', '--eval', script],
		{ encoding: 'utf8' }
	);

const base64url = (bytes) =>
	btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');

export const expiry = () => Math.floor(Date.now() / 1000) + 3600;

/** An HS256 session JWT ({ sub, exp }), as POST /login issues it */
export const session = async (userId, exp = expiry()) => {
	const encoder = new TextEncoder();
	const encode = (value) => base64url(encoder.encode(JSON.stringify(value)));
	const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, exp })}`;
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(SECRET),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(unsigned));
	return `${unsigned}.${base64url(new Uint8Array(signature))}`;
};

/** Signs a browser context in as `userId`: the API's cookie and the client's persisted session */
export const signIn = async (context, userId) => {
	const exp = expiry();
	await context.addCookies([
		{
			name: 'auth',
			value: await session(userId, exp),
			url: API,
			httpOnly: true,
			sameSite: 'Strict',
			expires: exp
		}
	]);
	await context.addInitScript(
		(value) => localStorage.setItem('authenticationStore', value),
		JSON.stringify({ user: { _id: userId }, expires: exp })
	);
};

const FRAME = 1000 / 30;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/**
 * A film of `page`: each frame is a screenshot (at the context's deviceScaleFactor) with the time
 * it stays on screen, so scrolls and taps are drawn at 30 frames a second however long a
 * screenshot takes, and two recordings of the same steps are the same film.
 */
export const film = async (page, dir) => {
	fs.rmSync(dir, { recursive: true, force: true });
	fs.mkdirSync(dir, { recursive: true });
	const frames = [];

	// The tap mark: a translucent dot where a finger would be
	await page.addStyleTag({
		content: `#demo-tap{position:fixed;z-index:2147483647;width:44px;height:44px;margin:-22px 0 0 -22px;
border-radius:9999px;background:rgba(15,23,42,.28);border:2px solid rgba(255,255,255,.85);
box-shadow:0 2px 10px rgba(0,0,0,.25);pointer-events:none;opacity:0;left:0;top:0}
*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}`
	});
	await page.evaluate(() => {
		const dot = document.createElement('div');
		dot.id = 'demo-tap';
		document.body.append(dot);
	});

	const shoot = async (ms = FRAME) => {
		const file = path.resolve(dir, `f${String(frames.length).padStart(5, '0')}.png`);
		await page.screenshot({ path: file });
		frames.push({ file, ms });
	};

	const dot = (x, y, opacity, scale) =>
		page.evaluate(
			([x, y, opacity, scale]) => {
				const el = document.getElementById('demo-tap');
				el.style.left = `${x}px`;
				el.style.top = `${y}px`;
				el.style.opacity = String(opacity);
				el.style.transform = `scale(${scale})`;
			},
			[x, y, opacity, scale]
		);

	return {
		frames,
		/** The page as it is, for `ms` */
		hold: (ms) => shoot(ms),
		/** Scrolls the page's scroller to `top` over `ms` */
		scroll: async (top, ms = 700, selector = 'main#page') => {
			const from = await page.evaluate((s) => document.querySelector(s).scrollTop, selector);
			const steps = Math.max(1, Math.round(ms / FRAME));
			for (let i = 1; i <= steps; i++) {
				const value = from + (top - from) * ease(i / steps);
				await page.evaluate(
					([s, v]) => (document.querySelector(s).scrollTop = v),
					[selector, value]
				);
				await shoot();
			}
		},
		/** Scroll offset that puts `locator` at `offset` px from the top of the scroller */
		topOf: (locator, offset = 80, selector = 'main#page') =>
			locator.evaluate(
				(el, [s, offset]) => {
					const scroller = document.querySelector(s);
					const max = scroller.scrollHeight - scroller.clientHeight;
					const top =
						el.getBoundingClientRect().top -
						scroller.getBoundingClientRect().top +
						scroller.scrollTop -
						offset;
					return Math.max(0, Math.min(max, top));
				},
				[selector, offset]
			),
		/** A tap on `locator`: the dot appears, presses, and `after` runs (default: a click) */
		tap: async (locator, after) => {
			const box = await locator.boundingBox();
			const x = box.x + box.width / 2;
			const y = box.y + box.height / 2;
			for (const [opacity, scale] of [
				[0.35, 1.5],
				[0.7, 1.25],
				[1, 1.05],
				[1, 1]
			]) {
				await dot(x, y, opacity, scale);
				await shoot();
			}
			await shoot(260);
			await dot(x, y, 1, 0.8);
			await shoot(90);
			await dot(x, y, 0, 1);
			await (after ? after() : locator.click());
		},
		/** Writes the film (needs ffmpeg): `name`.webm, `name`.mp4 and its first frame, `name`.jpg */
		save: (name, { width = 640 } = {}) => {
			const list = frames.map(
				({ file, ms }) => `file '${file}'\nduration ${(ms / 1000).toFixed(4)}`
			);
			// The concat demuxer needs the last file twice to keep its duration
			list.push(`file '${frames.at(-1).file}'`);
			fs.writeFileSync(`${dir}/list.txt`, `ffconcat version 1.0\n${list.join('\n')}\n`);
			const input = [
				'-y',
				'-loglevel',
				'error',
				'-f',
				'concat',
				'-safe',
				'0',
				'-i',
				`${dir}/list.txt`
			];
			const filter = `fps=30,scale=${width}:-2:flags=lanczos,format=yuv420p`;
			execFileSync('ffmpeg', [
				...input,
				'-vf',
				filter,
				'-an',
				'-c:v',
				'libvpx-vp9',
				'-b:v',
				'0',
				'-crf',
				'34',
				'-row-mt',
				'1',
				'-g',
				'300',
				`${name}.webm`
			]);
			execFileSync('ffmpeg', [
				...input,
				'-vf',
				filter,
				'-an',
				'-c:v',
				'libx264',
				'-preset',
				'veryslow',
				'-crf',
				'25',
				'-profile:v',
				'high',
				'-movflags',
				'+faststart',
				`${name}.mp4`
			]);
			execFileSync('ffmpeg', [
				'-y',
				'-loglevel',
				'error',
				'-i',
				frames[0].file,
				'-vf',
				`scale=${width}:-2:flags=lanczos`,
				'-q:v',
				'4',
				`${name}.jpg`
			]);
			const total = frames.reduce((sum, { ms }) => sum + ms, 0);
			const size = (file) => `${Math.round(fs.statSync(file).size / 1024)} kB`;
			console.log(
				`${name}: ${(total / 1000).toFixed(1)} s, ${frames.length} frames, webm ${size(`${name}.webm`)}, mp4 ${size(`${name}.mp4`)}, jpg ${size(`${name}.jpg`)}`
			);
		}
	};
};
