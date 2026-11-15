<!--
@component
A short silent recording of the app on a phone, in a phone-shaped frame: the landing page's
demos (client/static/landing/<name>.webm, .mp4 and .jpg, its first frame). It plays in a loop
while it is on screen and stops when it leaves it; nothing is downloaded before that
(`preload="none"`, the poster alone). The button under it pauses and resumes it (a recording that
moves on its own for more than five seconds needs one). With "reduce motion" it does not start
by itself: the button plays it. Without JavaScript it is its first frame.
-->
<script lang="ts">
	import { asset } from '$app/paths';
	import { Pause, Play } from 'svelte-heros-v2';
	import { m } from './DemoVideo.messages.ts';

	let {
		name,
		label,
		caption
	}: {
		/** Base name of the files in client/static/landing */
		name: 'demo-style' | 'demo-journey';
		/** What the recording shows, for those who cannot see it */
		label: string;
		/** Shown under the frame */
		caption: string;
	} = $props();

	/** The share of the recording in sight from which it plays: its button, under it, can be in
	 * sight with little of the recording */
	const ON_SCREEN = 0.25;

	let video: HTMLVideoElement | undefined = $state();
	/** Whether the recording should play when it is on screen: the visitor's choice */
	let wanted = $state(true);
	let visible = $state(false);
	/** In the browser: the button only does something there */
	let ready = $state(false);

	$effect(() => {
		if (!video) return;
		ready = true;
		wanted = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const observer = new IntersectionObserver(
			// The ratio, not `isIntersecting`: some browsers set that one for any overlap
			([entry]) => {
				visible = entry.intersectionRatio >= ON_SCREEN;
			},
			{ threshold: ON_SCREEN }
		);
		observer.observe(video);
		return () => observer.disconnect();
	});

	$effect(() => {
		if (!video) return;
		if (wanted && visible) {
			// Interrupted by leaving the screen while it loads (AbortError): it starts again when it
			// comes back. Anything else (autoplay blocked, a recording that could not be loaded or
			// read): it stays on its first frame, and the button offers to play it again
			video.play().catch((error: unknown) => {
				if (!(error instanceof DOMException && error.name === 'AbortError')) wanted = false;
			});
		} else {
			video.pause();
		}
	});
</script>

<div class="mx-auto flex w-full max-w-[19rem] flex-col items-center gap-3" data-demo={name}>
	<figure class="flex w-full flex-col items-center gap-3">
		<div
			class="w-full overflow-hidden rounded-[2.25rem] border-[10px] border-surface-950 bg-surface-950 shadow-xl dark:border-surface-700 dark:bg-surface-700"
		>
			<video
				bind:this={video}
				class="block aspect-[5/9] w-full rounded-[1.6rem] bg-surface-100-900"
				width="640"
				height="1152"
				poster={asset(`landing/${name}.jpg`)}
				preload="none"
				muted
				loop
				playsinline
				disablepictureinpicture
				aria-label={label}
			>
				<source src={asset(`landing/${name}.webm`)} type="video/webm" />
				<source src={asset(`landing/${name}.mp4`)} type="video/mp4" />
			</video>
		</div>
		<figcaption class="text-center text-sm text-surface-700-300">{caption}</figcaption>
	</figure>
	<!-- Its room is kept before the page is interactive: nothing moves when the button shows -->
	<div class="flex min-h-8 items-center">
		{#if ready}
			<button type="button" class="btn btn-sm preset-tonal" onclick={() => (wanted = !wanted)}>
				{#if wanted}
					<Pause size="16" aria-hidden="true" /> {m.pause}
				{:else}
					<Play size="16" aria-hidden="true" /> {m.play}
				{/if}
			</button>
		{/if}
	</div>
</div>
