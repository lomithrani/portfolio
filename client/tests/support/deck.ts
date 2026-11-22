import { expect, type Locator, type Page } from '@playwright/test';

// The deck of matching (MatchDeck.svelte), reached and answered as a person with a keyboard would

/** Tabs until the focus is inside `deck` (its shortcuts work only there), at most 40 presses */
export const tabIntoDeck = async (page: Page, deck: Locator) => {
	for (let presses = 0; presses < 40; presses++) {
		if (await deck.evaluate((element) => element.contains(document.activeElement))) return;
		await page.keyboard.press('Tab');
	}
	throw new Error('The deck could not be reached with Tab');
};

/**
 * Waits until the card on top takes an answer: a card shown after something the person did takes
 * none for a moment (ANSWER_SETTLE_MS of #services/matching.ts, the buttons aria-disabled), so that
 * a double click never answers the next card
 */
export const answerable = async (deck: Locator) => {
	for (const name of ['Pass', 'Interested']) {
		await expect(deck.getByRole('button', { name, exact: true })).not.toHaveAttribute(
			'aria-disabled',
			'true'
		);
	}
};
