<script lang="ts">
	import type { Skill } from 'portfolio-api/models/database';
	import { previewTarget } from '#services/projectPreview.ts';

	let {
		skill,
		variant = 'hard',
		highlighted = false
	}: {
		skill: Pick<Skill, 'displayName'>;
		/** Same chip for both; soft skills (listed after the technical ones) are a lighter tint */
		variant?: 'hard' | 'soft';
		/** Matches the active filters: a colour change only, so rows never shift */
		highlighted?: boolean;
	} = $props();
</script>

<!-- data-preview: hovered (or tapped), the page shows the projects using this skill
	(ProjectPreview.svelte) -->
<span
	class="chip cursor-default border transition-colors hover:filter-none! {highlighted
		? 'preset-filled-primary-700-300 border-primary-700-300'
		: variant === 'hard'
			? 'preset-tonal-primary border-transparent'
			: 'border-transparent bg-[color-mix(in_oklab,var(--color-primary-50-950)_45%,transparent)] text-primary-950-50'}"
	data-variant={variant}
	data-highlighted={highlighted || undefined}
	data-preview={previewTarget.skill(skill.displayName)}
>
	{skill.displayName}
</span>
