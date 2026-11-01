import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } }
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: { parserOptions: { parser: ts.parser, extraFileExtensions: ['.svelte'] } }
	},
	{
		// TypeScript (svelte-check / tsc) already reports undefined identifiers, and it knows the
		// ambient declarations (e.g. the `google` namespace from @types/google.accounts) that
		// ESLint's scope analysis cannot see. See https://typescript-eslint.io/troubleshooting/faqs/eslint
		files: ['**/*.ts', '**/*.svelte'],
		rules: { 'no-undef': 'off' }
	},
	{ ignores: ['build/', '.svelte-kit/', 'node_modules/', 'test-results/', 'playwright-report/'] }
);
