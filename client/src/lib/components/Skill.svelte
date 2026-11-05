<script lang="ts">
	import type { Skill } from 'portfolio-api/models/database';

	let {
		skill,
		variant = 'hard',
		highlighted = false
	}: {
		skill: Pick<Skill, 'displayName'>;
		/** Technical skills are filled chips, soft skills outlined */
		variant?: 'hard' | 'soft';
		/** Matches the active filters: a colour change only, so rows never shift */
		highlighted?: boolean;
	} = $props();
</script>

<span
	class="chip border transition-colors hover:filter-none! {highlighted
		? 'preset-filled-primary-700-300 border-primary-700-300'
		: variant === 'hard'
			? 'preset-tonal-primary border-transparent'
			: 'border-surface-300-700 text-surface-800-200'}"
	data-variant={variant}
	data-highlighted={highlighted || undefined}
>
	{skill.displayName}
</span>
