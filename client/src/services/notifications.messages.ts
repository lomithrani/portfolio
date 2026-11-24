// Texts built by `notifications.ts`: the account menu's badge of what matching brought that the
// account has not seen yet (its mutual interests going on: GET /me/notifications). Never a bare
// "match" (decision 11 of the founder: it names the score), and no email is ever promised: the
// badge is all there is (decision 10)
import { defineMessages, plural } from 'portfolio-common';

export const m = defineMessages({
	/** Beside "Opportunities" and on its tab, shown (the label below is what is read out) */
	unseenBadge: {
		en: (count: number) => `${count} new`,
		fr: (count: number) => plural(count, `${count} nouveau`, `${count} nouveaux`)
	},
	/** For screen readers, in place of the badge: '1 new mutual interest' */
	unseenLabel: {
		en: (count: number) => `${count} new ${plural(count, 'mutual interest', 'mutual interests')}`,
		fr: (count: number) =>
			plural(count, `${count} nouvel intérêt réciproque`, `${count} nouveaux intérêts réciproques`)
	}
});
