import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import type { PluginOption } from 'vite';

export default defineConfig(({ mode }) => {
	let plugins: PluginOption[] = [tailwindcss(), sveltekit()];
	return {
		plugins: plugins,
		test: {
			include: ['src/**/*.{test,spec}.{js,ts}']
		},
	}
});
