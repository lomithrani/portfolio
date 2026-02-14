import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import type { PluginOption } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
	let plugins: PluginOption[] = [tailwindcss(), sveltekit()];
	return {
		plugins: plugins,
		resolve: {
			alias: {
				$services: path.resolve('./src/services'),
			}
		},
		test: {
			include: ['src/**/*.{test,spec}.{js,ts}']
		},
	}
});
