<script lang="ts">
	import type { Skill } from 'portfolio-api/models';
	export let skill: Skill;
</script>

<span class="chip variant-filled-primary">
	{skill.name}
</span>
