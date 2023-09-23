<script lang="ts">
  import { portfolioApiService } from "../services";
  const experiencesPromise = portfolioApiService.experiences.get();
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
