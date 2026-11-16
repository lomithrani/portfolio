// Text people write that the API files as a public GitHub issue (step suggestions, feedback):
// what is filed is what a reader of the issue sees.

// What never reaches the issue: C0 and C1 controls but tab and line feed, the Unicode line
// separators, every character Unicode says is not displayed (Default_Ignorable_Code_Point: bidi
// controls, zero-width characters, variation selectors, the "tag" characters that can spell a
// hidden sentence, blank fillers), the braille blank and lone surrogates. A joined emoji comes
// apart; in exchange nothing is filed that a reader of the issue cannot see
const NOT_FILED =
	/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u2028\u2029\u2800]|\p{Default_Ignorable_Code_Point}|[\uD800-\uDFFF]/gu;

/** A text as it is filed on GitHub: one kind of line break, nothing invisible, trimmed */
export const cleanIssueText = (value: string) =>
	value.replace(/\r\n?/g, '\n').replace(NOT_FILED, '').trim();
