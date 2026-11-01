<script lang="ts">
	import type { Skill } from 'portfolio-api/models/database';
	let { skill, highlighted = false }: { skill: Skill; highlighted?: boolean } = $props();
</script>

<span
	class="chip transition-all {highlighted
		? 'preset-filled-primary-700-300 ring-2 ring-primary-700-300 scale-105'
		: 'preset-tonal-primary'}"
>
	{skill.displayName}
</span>
