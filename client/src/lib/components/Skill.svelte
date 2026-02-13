<script lang="ts">
	import type { Skill } from 'portfolio-api/models/database';
	let { skill, level }: { skill: Skill; level: number } = $props();
</script>

<span class="chip variant-filled-primary">
	{skill.displayName}
</span>
