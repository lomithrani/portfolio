<!--
@component
Asks before a job description is first opened (portfolio-common's locksJobTerms: one never opened
leaving the drafts): its pay and its conditions are locked from then on (the API refuses to change
them), so a new version of them is a new job description (Duplicate). The status control of its
page and the job editor's save both ask it, and list the fields it locks. Confirming closes the dialog and calls `onConfirm`,
which saves (the page or the editor shows that it does, and why it failed).
-->
<script lang="ts">
	import { JOB_STATUS_LABELS, type JobStatus } from 'portfolio-common';
	import { lockedFieldsText } from '#services/jobPosting.ts';
	import { common } from '#lib/i18n/common.messages.ts';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { m } from './OpenJobDialog.messages.ts';

	let {
		status,
		onConfirm,
		onCancel,
		finalFocusEl
	}: {
		/** The status the job description is about to take; null: the dialog is closed */
		status: JobStatus | null;
		onConfirm: (status: JobStatus) => void;
		onCancel: () => void;
		/** Where the focus goes once the dialog closes (by default, what had it when it opened) */
		finalFocusEl?: () => HTMLElement | null;
	} = $props();

	// The last status asked about: the texts stay while the dialog closes
	let shown: JobStatus = $state('open');
	$effect(() => {
		if (status) shown = status;
	});
</script>

<ConfirmDialog
	open={status !== null}
	title={shown === 'open' ? m.openTitle : m.setTitle(JOB_STATUS_LABELS[shown])}
	description={shown === 'open' ? m.openLocks : m.leavingDraftLocks}
	details={m.lockedFields(lockedFieldsText())}
	confirmLabel={shown === 'open' ? m.open : m.set(JOB_STATUS_LABELS[shown])}
	busyLabel={common.saving}
	tone="primary"
	onConfirm={() => {
		if (status) onConfirm(status);
	}}
	{onCancel}
	{finalFocusEl}
/>
