<script lang="ts">
	import { Marked } from 'marked';
	import { markedHighlight } from 'marked-highlight';
	import hljs from 'highlight.js';
	import DOMPurify from 'isomorphic-dompurify';
	import 'highlight.js/styles/github.css';

	let { content = '' }: { content: string } = $props();

	const marked = new Marked(
		markedHighlight({
			langPrefix: 'hljs language-',
			highlight(code, lang) {
				if (lang && hljs.getLanguage(lang)) {
					return hljs.highlight(code, { language: lang }).value;
				}
				return hljs.highlightAuto(code).value;
			}
		})
	);

	marked.setOptions({
		gfm: true,
		breaks: true
	});

	let html = $derived(DOMPurify.sanitize(marked.parse(content) as string));
</script>

<div class="markdown">
	{@html html}
</div>

<style>
	.markdown {
		line-height: 1.6;
		word-wrap: break-word;
	}

	/* Headings */
	.markdown :global(h1),
	.markdown :global(h2),
	.markdown :global(h3),
	.markdown :global(h4),
	.markdown :global(h5),
	.markdown :global(h6) {
		margin-top: 1em;
		margin-bottom: 0.5em;
		font-weight: 600;
		line-height: 1.25;
	}
	.markdown :global(h1) {
		font-size: 1.5em;
		padding-bottom: 0.3em;
		border-bottom: 1px solid var(--color-surface-300);
	}
	.markdown :global(h2) {
		font-size: 1.25em;
		padding-bottom: 0.3em;
		border-bottom: 1px solid var(--color-surface-300);
	}
	.markdown :global(h3) {
		font-size: 1.1em;
	}
	.markdown :global(:first-child) {
		margin-top: 0;
	}

	/* Paragraphs */
	.markdown :global(p) {
		margin-top: 0;
		margin-bottom: 0.75em;
	}
	.markdown :global(p:last-child) {
		margin-bottom: 0;
	}

	/* Links */
	.markdown :global(a) {
		color: var(--color-primary-500);
		text-decoration: none;
	}
	.markdown :global(a:hover) {
		text-decoration: underline;
	}

	/* Bold & Italic */
	.markdown :global(strong) {
		font-weight: 600;
	}

	/* Lists */
	.markdown :global(ul),
	.markdown :global(ol) {
		padding-left: 1.5em;
		margin-top: 0;
		margin-bottom: 0.75em;
	}
	.markdown :global(ul) {
		list-style: disc;
	}
	.markdown :global(ol) {
		list-style: decimal;
	}
	.markdown :global(li) {
		margin-top: 0.25em;
	}
	.markdown :global(li > ul),
	.markdown :global(li > ol) {
		margin-bottom: 0;
	}

	/* Task lists (GFM) */
	.markdown :global(ul:has(> li > input[type='checkbox'])) {
		list-style: none;
		padding-left: 0.5em;
	}
	.markdown :global(input[type='checkbox']) {
		margin-right: 0.4em;
		vertical-align: middle;
	}

	/* Blockquotes */
	.markdown :global(blockquote) {
		margin: 0 0 0.75em;
		padding: 0.25em 1em;
		border-left: 0.25em solid var(--color-surface-400);
		color: var(--color-surface-600);
	}
	.markdown :global(blockquote > :last-child) {
		margin-bottom: 0;
	}

	/* Inline code */
	.markdown :global(code) {
		padding: 0.2em 0.4em;
		font-size: 85%;
		background: var(--color-surface-200);
		border-radius: 6px;
		font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono',
			monospace;
	}

	/* Code blocks */
	.markdown :global(pre) {
		padding: 1em;
		margin-top: 0;
		margin-bottom: 0.75em;
		overflow-x: auto;
		font-size: 85%;
		line-height: 1.45;
		background: var(--color-surface-200);
		border-radius: 6px;
	}
	.markdown :global(pre code) {
		padding: 0;
		background: transparent;
		border-radius: 0;
		font-size: inherit;
	}

	/* Tables */
	.markdown :global(table) {
		width: 100%;
		border-collapse: collapse;
		margin-bottom: 0.75em;
	}
	.markdown :global(th),
	.markdown :global(td) {
		padding: 6px 13px;
		border: 1px solid var(--color-surface-300);
	}
	.markdown :global(th) {
		font-weight: 600;
		background: var(--color-surface-200);
	}
	.markdown :global(tr:nth-child(2n)) {
		background: var(--color-surface-100);
	}

	/* Horizontal rules */
	.markdown :global(hr) {
		height: 0.25em;
		padding: 0;
		margin: 1.5em 0;
		background-color: var(--color-surface-300);
		border: 0;
		border-radius: 2px;
	}

	/* Images */
	.markdown :global(img) {
		max-width: 100%;
		border-radius: 6px;
	}

	/* Strikethrough (GFM) */
	.markdown :global(del) {
		opacity: 0.65;
	}
</style>
