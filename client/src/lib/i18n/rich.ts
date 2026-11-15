// A message with marked-up passages: 'Details in the <privacy>privacy policy</privacy>.'
// The message stays one sentence a translator can reorder; Rich.svelte renders each passage
// with the snippet of its name (a link, an emphasis) and everything else as plain text.

export interface RichPart {
	/** Name of the passage's tag; none for plain text */
	tag?: string;
	text: string;
}

const PASSAGE = /<([a-z][a-zA-Z0-9]*)>(.*?)<\/\1>/gs;

/** `text` cut into plain text and tagged passages, in order. Tags do not nest. */
export const richParts = (text: string): RichPart[] => {
	const parts: RichPart[] = [];
	let end = 0;
	for (const match of text.matchAll(PASSAGE)) {
		if (match.index > end) parts.push({ text: text.slice(end, match.index) });
		parts.push({ tag: match[1], text: match[2] });
		end = match.index + match[0].length;
	}
	if (end < text.length) parts.push({ text: text.slice(end) });
	return parts;
};

/** `text` without its tags, for a place that only takes plain text (an attribute, a toast) */
export const plainText = (text: string): string =>
	richParts(text)
		.map((part) => part.text)
		.join('');
