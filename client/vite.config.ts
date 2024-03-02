import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type UserConfig } from 'vitest/config';
import { nodeLoaderPlugin } from '@vavite/node-loader/plugin';
import type { PluginOption } from 'vite';

export default defineConfig(({ mode }): UserConfig => {
	let plugins: PluginOption[] = [sveltekit()];
	if (mode === 'development') {
		plugins = [nodeLoaderPlugin(), ...plugins]
	}
	return {
		plugins: plugins,
		test: {
			include: ['src/**/*.{test,spec}.{js,ts}']
		},
	}
});
