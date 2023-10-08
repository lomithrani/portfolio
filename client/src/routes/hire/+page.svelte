<script>
	import { hasOneOf } from '../../services/authentication';
	import { UserRole } from 'portfolio-common';
</script>

<svelte:head>
	<title>About</title>
	<meta name="description" content="About this app" />
</svelte:head>

{#if $hasOneOf([UserRole.Recruiter])}
	<div class="text-column">
		<h1>Job description</h1>
	</div>
{:else}
	<div class="text-column">Unauthorized</div>
{/if}
