import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import adapter from '@sveltejs/adapter-bun';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter: adapter(),
			preprocess: [vitePreprocess({ script: true })],
			tracing: { server: true },
			// Defence in depth for content users publish (job descriptions, portfolios): forms
			// only post to this site (Google sign-in uses popups), no <base> or plugin can be
			// injected. Scripts and styles are not restricted here: no nonce is needed
			csp: {
				directives: {
					'form-action': ['self'],
					'base-uri': ['self'],
					'object-src': ['none']
				}
			}
		})
	],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
