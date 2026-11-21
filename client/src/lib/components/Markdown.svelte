<script lang="ts" module>
	import { Marked } from 'marked';
	import { markedHighlight } from 'marked-highlight';
	// The core build plus a curated set of languages: the full bundle (~190 languages) made
	// the experiences page, where every visitor lands, ship over 1 MB of JavaScript.
	import hljs from 'highlight.js/lib/core';
	import bash from 'highlight.js/lib/languages/bash';
	import csharp from 'highlight.js/lib/languages/csharp';
	import css from 'highlight.js/lib/languages/css';
	import diff from 'highlight.js/lib/languages/diff';
	import dockerfile from 'highlight.js/lib/languages/dockerfile';
	import go from 'highlight.js/lib/languages/go';
	import java from 'highlight.js/lib/languages/java';
	import javascript from 'highlight.js/lib/languages/javascript';
	import json from 'highlight.js/lib/languages/json';
	import kotlin from 'highlight.js/lib/languages/kotlin';
	import markdown from 'highlight.js/lib/languages/markdown';
	import php from 'highlight.js/lib/languages/php';
	import plaintext from 'highlight.js/lib/languages/plaintext';
	import python from 'highlight.js/lib/languages/python';
	import rust from 'highlight.js/lib/languages/rust';
	import scss from 'highlight.js/lib/languages/scss';
	import shell from 'highlight.js/lib/languages/shell';
	import sql from 'highlight.js/lib/languages/sql';
	import typescript from 'highlight.js/lib/languages/typescript';
	import xml from 'highlight.js/lib/languages/xml';
	import yaml from 'highlight.js/lib/languages/yaml';
	import DOMPurify from 'isomorphic-dompurify';
	import { m } from './Markdown.messages.ts';
	import 'highlight.js/styles/github.css';

	const languages = {
		bash,
		csharp,
		css,
		diff,
		dockerfile,
		go,
		java,
		javascript,
		json,
		kotlin,
		markdown,
		php,
		plaintext,
		python,
		rust,
		scss,
		shell,
		sql,
		typescript,
		xml,
		yaml
	};
	for (const [name, language] of Object.entries(languages)) {
		hljs.registerLanguage(name, language);
	}

	/** Text shown as written: a style tag stays the characters it is, never an element */
	const escapeHtml = (text: string) =>
		text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');

	/**
	 * Where a link of markdown anyone can publish leads, shown beside it: the host of an http(s)
	 * link (its punycode for a lookalike name), the href without what precedes an `@` (a name
	 * there reads as the host: `https://acme.example@t.example` leads to t.example, which `userinfo`
	 * says). A link without a scheme still leads elsewhere when it names a host (`//t.example`,
	 * `///t.example`, `/\\/t.example`, inline or by reference): read as a browser reads it, it
	 * is one. null for anything else: a path of this site stays as markdown makes it, a link of
	 * another scheme too (DOMPurify drops what is not safe)
	 */
	const linkTarget = (href: string): { href: string; host: string; userinfo: boolean } | null => {
		let url: URL;
		try {
			url = new URL(href);
		} catch {
			// No scheme: a path of this site resolves to whichever site it is read on, a host named
			// leads there whatever the site
			try {
				const here = new URL(href, 'https://a.invalid/');
				const there = new URL(href, 'https://b.invalid/');
				if (here.host === 'a.invalid' && there.host === 'b.invalid') return null;
				url = here;
			} catch {
				return null;
			}
		}
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
		return {
			// Written again without what precedes an `@`
			href: `${url.protocol}//${url.host}${url.pathname}${url.search}${url.hash}`,
			host: url.host,
			userinfo: url.username !== '' || url.password !== ''
		};
	};

	/**
	 * A link's text is itself its address (a bare or www link: `https://acme.example/jobs`,
	 * `www.acme.example`): its host, then nothing or a path, query or fragment. Read as written,
	 * tags dropped, ASCII letters lowercased only (a lookalike written in another alphabet is not
	 * the punycode host it leads to); anything else, the host's name somewhere in a sentence or a
	 * query included, says nothing of where it leads
	 */
	const textIsAddress = (html: string, host: string) => {
		const plain = html
			.replace(/<[^>]*>/g, '')
			.trim()
			.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
		return [host, `http://${host}`, `https://${host}`].some((start) => {
			if (!plain.startsWith(start)) return false;
			const rest = plain.slice(start.length);
			return rest === '' || /^[/?#]/.test(rest);
		});
	};

	const createParser = (headingOffset: number, html: boolean, linkHosts: boolean) => {
		const parser = new Marked(
			markedHighlight({
				langPrefix: 'hljs language-',
				highlight(code, lang) {
					if (lang && hljs.getLanguage(lang)) {
						return hljs.highlight(code, { language: lang }).value;
					}
					return hljs.highlightAuto(code).value;
				}
			}),
			{ gfm: true, breaks: true }
		);
		if (headingOffset > 0) {
			// Headings of embedded markdown rank below the page's own (e.g. a card's h2 title)
			parser.use({
				renderer: {
					heading({ tokens, depth }) {
						const level = Math.min(6, depth + headingOffset);
						return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`;
					}
				}
			});
		}
		if (linkHosts) {
			// A link's text may say anything: where it leads is shown beside it, inside the link (its
			// name says it to a screen reader, with the new tab), and it opens apart, sending no
			// referrer (a per-reader address behind harmless words would tell its author who clicked,
			// from where, before anything else is shared)
			parser.use({
				renderer: {
					link({ href, title, tokens }) {
						const target = linkTarget(href);
						if (!target) return false;
						const text = this.parser.parseInline(tokens);
						const titled = title ? ` title="${escapeHtml(title)}"` : '';
						const host =
							!target.userinfo && textIsAddress(text, target.host)
								? ''
								: ` <span class="link-host">(${escapeHtml(target.host)})</span>`;
						// Read here, at each parse: the parser is shared by every page and language
						const newTab = `<span class="sr-only"> ${escapeHtml(m.newTab)}</span>`;
						return `<a class="link-apart" href="${escapeHtml(target.href)}"${titled} target="_blank" rel="noopener noreferrer nofollow"><span class="link-text">${text}</span>${host}${newTab}</a>`;
					}
				}
			});
		}
		if (!html) {
			// Raw HTML (a block or an inline tag) is shown as the text it is
			parser.use({
				renderer: {
					html({ text, block }) {
						return block ? `<p>${escapeHtml(text.trim())}</p>\n` : escapeHtml(text);
					}
				}
			});
		}
		return parser;
	};

	// One shared parser per heading offset, HTML mode and way of showing links, for every Markdown
	// instance (one per experience and per project)
	const parsers: Record<string, Marked> = {};
	const parserFor = (headingOffset: number, html: boolean, linkHosts = false) => {
		const offset = Math.max(0, Math.min(5, Math.trunc(headingOffset) || 0));
		const key = `${offset}:${html}:${linkHosts}`;
		parsers[key] ??= createParser(offset, html, linkHosts);
		return parsers[key];
	};

	/** The depth of the markdown's highest heading (1 for '#', 2 for '##'); undefined without one */
	const topHeadingDepth = (content: string): number | undefined => {
		const parser = parserFor(0, true);
		let top: number | undefined;
		parser.walkTokens(parser.lexer(content), (token) => {
			if (token.type === 'heading') top = Math.min(top ?? 6, token.depth);
		});
		return top;
	};

	/**
	 * Markdown anyone can publish (html: false): only the elements markdown itself makes, without
	 * styles, forms or images. Raw HTML is already text by then: this holds should it not be.
	 */
	const STRICT = {
		ALLOWED_TAGS: [
			'p',
			'br',
			'hr',
			'h1',
			'h2',
			'h3',
			'h4',
			'h5',
			'h6',
			'ul',
			'ol',
			'li',
			'a',
			'strong',
			'em',
			'del',
			'code',
			'pre',
			'span',
			'blockquote',
			'table',
			'thead',
			'tbody',
			'tr',
			'th',
			'td'
		],
		// target and rel: the links linkHosts opens apart (raw HTML is text by then)
		ALLOWED_ATTR: ['href', 'title', 'class', 'start', 'align', 'target', 'rel'],
		ALLOW_DATA_ATTR: false
	};
</script>

<script lang="ts">
	let {
		content = '',
		headingOffset = 0,
		topHeadingLevel,
		html = true,
		linkHosts = false,
		compact = false
	}: {
		content: string;
		/** Levels added to the markdown headings: 2 turns '# Title' into an <h3> */
		headingOffset?: number;
		/**
		 * Instead of headingOffset: the level of the content's highest heading, the others keeping
		 * their distance (4 turns '## Mission' and '### Details' into an <h4> and an <h5>), so the
		 * outline never skips a level whichever heading the content starts with
		 */
		topHeadingLevel?: number;
		/**
		 * Raw HTML in the markdown is rendered (sanitized). false shows it as text and keeps only
		 * what markdown makes: for markdown anyone can publish (job descriptions)
		 */
		html?: boolean;
		/**
		 * With html false: each http(s) link shows the host it leads to beside its text, opens in a
		 * new tab and sends no referrer (job descriptions: a recruiter's link read by candidates
		 * matching proposes the job to, and by the reviewers who read it as they will)
		 */
		linkHosts?: boolean;
		/** Small headings without underline, for markdown inside cards */
		compact?: boolean;
	} = $props();

	let offset = $derived(
		topHeadingLevel === undefined
			? headingOffset
			: topHeadingLevel - (topHeadingDepth(content ?? '') ?? topHeadingLevel)
	);
	let rendered = $derived.by(() => {
		const markup = parserFor(offset, html, linkHosts).parse(content ?? '') as string;
		return html ? DOMPurify.sanitize(markup) : DOMPurify.sanitize(markup, STRICT);
	});
</script>

<div class="markdown" class:compact>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized with DOMPurify above -->
	{@html rendered}
</div>

<style>
	/* Colours use Skeleton's light/dark pairs (e.g. surface-200-800) so both modes stay readable */
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
		border-bottom: 1px solid var(--color-surface-300-700);
	}
	.markdown :global(h2) {
		font-size: 1.25em;
		padding-bottom: 0.3em;
		border-bottom: 1px solid var(--color-surface-300-700);
	}
	.markdown :global(h3) {
		font-size: 1.1em;
	}
	.markdown :global(:first-child) {
		margin-top: 0;
	}

	/* Compact (inside cards): headings stay below the card title, without underline */
	.markdown.compact :global(:is(h1, h2, h3, h4, h5, h6)) {
		font-size: 1em;
		margin-top: 0.75em;
		margin-bottom: 0.25em;
		padding-bottom: 0;
		border-bottom: 0;
	}
	.markdown.compact :global(:is(h1, h2, h3, h4, h5, h6):first-child) {
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
	.markdown :global(.link-host) {
		font-size: 0.875em;
		color: var(--color-surface-700-300);
		overflow-wrap: anywhere;
	}
	/* A link opened apart (linkHosts): its text underlined, the host beside it not */
	.markdown :global(a.link-apart) {
		text-decoration: none;
	}
	.markdown :global(a.link-apart .link-text) {
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 2px;
	}
	.markdown :global(a.link-apart:hover .link-text) {
		text-decoration-thickness: 2px;
	}

	.markdown :global(a) {
		color: var(--color-primary-700-300);
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 2px;
	}
	.markdown :global(a:hover) {
		text-decoration-thickness: 2px;
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
	.markdown :global(:is(ul, ol):last-child) {
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
		border-left: 0.25em solid var(--color-surface-300-700);
		color: var(--color-surface-700-300);
	}
	.markdown :global(blockquote > :last-child) {
		margin-bottom: 0;
	}

	/* Inline code */
	.markdown :global(code) {
		padding: 0.2em 0.4em;
		font-size: 85%;
		background: var(--color-surface-200-800);
		border-radius: 6px;
		font-family:
			ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
	}

	/* Code blocks */
	.markdown :global(pre) {
		padding: 1em;
		margin-top: 0;
		margin-bottom: 0.75em;
		overflow-x: auto;
		font-size: 85%;
		line-height: 1.45;
		background: var(--color-surface-100-900);
		border: 1px solid var(--color-surface-200-800);
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
		/* Wide tables scroll instead of overflowing the card */
		display: block;
		width: max-content;
		max-width: 100%;
		overflow-x: auto;
		border-collapse: collapse;
		margin-bottom: 0.75em;
	}
	.markdown :global(th),
	.markdown :global(td) {
		padding: 6px 13px;
		border: 1px solid var(--color-surface-300-700);
	}
	.markdown :global(th) {
		font-weight: 600;
		background: var(--color-surface-200-800);
	}
	.markdown :global(tr:nth-child(2n)) {
		background: var(--color-surface-100-900);
	}

	/* Horizontal rules */
	.markdown :global(hr) {
		height: 0.25em;
		padding: 0;
		margin: 1.5em 0;
		background-color: var(--color-surface-300-700);
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

	/* highlight.js: the imported github theme is light; GitHub Dark colours in dark mode */
	:global(.dark) .markdown :global(.hljs) {
		color: #c9d1d9;
	}
	:global(.dark) .markdown :global(:is(.hljs-doctag, .hljs-keyword, .hljs-template-tag)),
	:global(.dark) .markdown :global(:is(.hljs-template-variable, .hljs-type)),
	:global(.dark) .markdown :global(:is(.hljs-meta .hljs-keyword, .hljs-variable.language_)) {
		color: #ff7b72;
	}
	:global(.dark) .markdown :global(:is(.hljs-title, .hljs-title.class_, .hljs-title.function_)) {
		color: #d2a8ff;
	}
	:global(.dark) .markdown :global(:is(.hljs-attr, .hljs-attribute, .hljs-literal, .hljs-meta)),
	:global(.dark) .markdown :global(:is(.hljs-number, .hljs-operator, .hljs-variable)),
	:global(.dark) .markdown :global(:is(.hljs-selector-attr, .hljs-selector-class)),
	:global(.dark) .markdown :global(.hljs-selector-id) {
		color: #79c0ff;
	}
	:global(.dark) .markdown :global(:is(.hljs-regexp, .hljs-string, .hljs-meta .hljs-string)) {
		color: #a5d6ff;
	}
	:global(.dark) .markdown :global(:is(.hljs-built_in, .hljs-symbol)) {
		color: #ffa657;
	}
	:global(.dark) .markdown :global(:is(.hljs-comment, .hljs-code, .hljs-formula)) {
		color: #8b949e;
	}
	:global(.dark) .markdown :global(:is(.hljs-name, .hljs-quote, .hljs-selector-tag)),
	:global(.dark) .markdown :global(.hljs-selector-pseudo) {
		color: #7ee787;
	}
	:global(.dark) .markdown :global(:is(.hljs-subst, .hljs-emphasis, .hljs-strong)) {
		color: #c9d1d9;
	}
	:global(.dark) .markdown :global(.hljs-section) {
		color: #1f6feb;
	}
	:global(.dark) .markdown :global(.hljs-bullet) {
		color: #f2cc60;
	}
	:global(.dark) .markdown :global(.hljs-addition) {
		color: #aff5b4;
		background-color: #033a16;
	}
	:global(.dark) .markdown :global(.hljs-deletion) {
		color: #ffdcd7;
		background-color: #67060c;
	}
</style>
