// What the landing page's share image (static/og-image.png, og-image-fr.png) says beside its
// headline: three of the page's promises, as the page words them. client/scripts/og-image/render.mjs
// draws them, and the image's alternative text (meta.imageAlt of page.messages.ts) names them:
// shareImage.test.ts fails when the two disagree. Render the images again when one changes.
import { m } from './page.messages.ts';

/** The three promise titles drawn beside the journey, in the language in use */
export const landingImageSide = (): string[] => [
	m.promises.free.title,
	m.promises.pay.title,
	m.promises.steps.title
];
