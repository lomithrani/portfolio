<script lang="ts">
	import type { PresentedSkill } from 'portfolio-api/models/database';
	import { previewTarget } from '#services/projectPreview.ts';

	let {
		skill,
		variant = 'hard',
		highlighted = false
	}: {
		skill: Pick<PresentedSkill, 'displayName'>;
		/** Same chip for both; soft skills (listed after the technical ones) are a lighter tint */
		variant?: 'hard' | 'soft';
		/** Matches the active filters: a colour change only, so rows never shift */
		highlighted?: boolean;
	} = $props();
</script>

<!-- data-preview: hovered (or tapped), the page shows the projects using this skill
	(ProjectPreview.svelte). A name too long for its card is cut short rather than pushing the page
	sideways (the preview has it whole): the padding the inner text takes back keeps a "g" or a "y"
	whole, the tag's line being exactly as tall as its text -->
<span
	class="chip max-w-full cursor-default border transition-colors hover:filter-none! {highlighted
		? 'preset-filled-primary-700-300 border-primary-700-300'
		: variant === 'hard'
			? 'preset-tonal-primary border-transparent'
			: 'border-transparent bg-[color-mix(in_oklab,var(--color-primary-50-950)_45%,transparent)] text-primary-950-50'}"
	data-variant={variant}
	data-highlighted={highlighted || undefined}
	data-preview={previewTarget.skill(skill.displayName)}
>
	<span class="-my-0.5 truncate py-0.5">{skill.displayName}</span>
</span>
