import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import adapter from '@sveltejs/adapter-bun';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter: adapter(),
			preprocess: [vitePreprocess({ script: true })],
			alias: {
				$lib: 'src/lib',
				$components: 'src/lib/components',
				$services: 'src/services',
				$images: 'src/lib/images'
			},
			tracing: { server: true }
		})
	],
	resolve: {
		alias: {
			$services: path.resolve('./src/services')
		}
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
