<script lang="ts">
	import { portfolioApi } from '../../services';
	const experiencesPromise = portfolioApi.experiences.get({
		$fetch: { credentials: 'include' }
	});
</script>

{#await experiencesPromise}
	Calling service
{:then experiences}
	{#each experiences.data || [] as experience}
		<div>{experience.name}</div>
	{/each}
{:catch someError}
	System error: {someError.message}.
{/await}
