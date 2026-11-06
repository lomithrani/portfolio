<!--
@component
The sun/moon light and dark switch. It owns the choice: applied to <html> (the `dark` class and
`color-scheme`) and kept in this browser under 'portfolio-dark-mode', which app.html reads again
before the first paint. Without a saved choice it starts on `defaultDark` (a portfolio's
defaultDarkMode), else on the system preference.
-->
<script lang="ts">
	import { Sun, Moon } from 'svelte-heros-v2';
	import { browser } from '$app/env';

	let { defaultDark }: { defaultDark?: boolean | null } = $props();

	const DARK_MODE_KEY = 'portfolio-dark-mode';

	// Storage can be unavailable (blocked site data, some private windows): the switch still works
	const readStored = (): string | null => {
		try {
			return localStorage.getItem(DARK_MODE_KEY);
		} catch {
			return null;
		}
	};

	const store = (dark: boolean) => {
		try {
			localStorage.setItem(DARK_MODE_KEY, String(dark));
		} catch {
			// Not remembered: the choice lasts until the page is left
		}
	};

	function getInitialDarkMode(): boolean {
		if (!browser) return true;
		const stored = readStored();
		if (stored !== null) return stored === 'true';
		if (defaultDark !== undefined && defaultDark !== null) return defaultDark;
		return window.matchMedia('(prefers-color-scheme: dark)').matches;
	}

	let darkMode = $state(getInitialDarkMode());

	$effect(() => {
		if (!browser) return;
		document.documentElement.classList.toggle('dark', darkMode);
		document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
		store(darkMode);
	});

	function toggleDarkMode() {
		darkMode = !darkMode;
	}
</script>

<button
	type="button"
	class="theme-toggle"
	class:is-dark={darkMode}
	onclick={toggleDarkMode}
	aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
>
	<span class="toggle-track">
		<span class="toggle-icon sun-icon">
			<Sun size="14" />
		</span>
		<span class="toggle-icon moon-icon">
			<Moon size="14" />
		</span>
		<span class="toggle-thumb"></span>
	</span>
</button>

<style>
	.theme-toggle {
		border: none;
		background: none;
		padding: 0;
		cursor: pointer;
		display: flex;
		justify-content: center;
	}

	.toggle-track {
		position: relative;
		width: 48px;
		height: 26px;
		border-radius: 13px;
		background: linear-gradient(135deg, #89cff0, #ffd700);
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 5px;
		transition: background 0.4s ease;
	}

	.is-dark .toggle-track {
		background: linear-gradient(135deg, #1a1a3e, #2d2d6b);
	}

	.toggle-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1;
		transition: opacity 0.3s ease;
	}

	.sun-icon {
		color: #f59e0b;
	}

	.is-dark .sun-icon {
		opacity: 0.3;
	}

	.moon-icon {
		color: #fbbf24;
	}

	:not(.is-dark) > .toggle-track > .moon-icon {
		opacity: 0.3;
	}

	.toggle-thumb {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: white;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
		transition: transform 0.3s ease;
	}

	.is-dark .toggle-thumb {
		transform: translateX(22px);
		background: #e2e8f0;
	}
</style>
