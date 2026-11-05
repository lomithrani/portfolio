import { createToaster } from '@skeletonlabs/skeleton-svelte';

/**
 * App-wide toasts (rendered by the <Toast.Group> of routes/[domain]/+layout.svelte).
 * Kept on screen long enough to be read: the defaults (2 s for success) are too short.
 */
export const toaster = createToaster({
	placement: 'bottom-end',
	duration: 5000,
	max: 3
});
