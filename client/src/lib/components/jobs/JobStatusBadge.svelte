<!--
@component
A job posting's status as a badge: Draft, Open, On hold, Filled or Closed.
-->
<script lang="ts">
	import type { JobStatus } from 'portfolio-common';
	import { statusBadgeClass, statusLabel } from '#services/jobPosting.ts';

	let { status, class: className = '' }: { status: JobStatus; class?: string } = $props();
</script>

<!-- Skeleton's badge text is 80% of text-xs: a status reads better at text-xs -->
<span class="relative badge [--badge-size:var(--text-xs)] {statusBadgeClass(status)} {className}">
	<span class="sr-only">Status:</span>
	{statusLabel(status)}
</span>
