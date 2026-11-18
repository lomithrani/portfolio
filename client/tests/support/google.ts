import type { Page } from '@playwright/test';

// Google's sign-in, stubbed in the browser: Google is never reached. Its script is replaced by a
// fake "Sign in with Google" button that hands a fake credential to the page (the API's POST
// /login is then answered in the browser too: it would refuse the credential).

/** Google Identity Services: a button that signs in with a fake credential when clicked */
const GSI_STUB = `
window.google = { accounts: { id: {
	initialize(options) { window.__gsiCallback = options.callback; },
	renderButton(element) {
		const button = document.createElement('button');
		button.type = 'button';
		button.textContent = 'Stub Google sign-in';
		button.onclick = () => window.__gsiCallback && window.__gsiCallback({ credential: 'stub-credential' });
		element.replaceChildren(button);
	},
	prompt() {}, cancel() {}, disableAutoSelect() {}
} } };`;

/** Answers the page's requests to Google's sign-in with the stub; returns the URLs it asked for */
export const stubGoogle = async (page: Page) => {
	const requests: string[] = [];
	await page.route('https://accounts.google.com/**', (route) => {
		requests.push(route.request().url());
		return route.fulfill({ contentType: 'application/javascript', body: GSI_STUB });
	});
	return requests;
};
