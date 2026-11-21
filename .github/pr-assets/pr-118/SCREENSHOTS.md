# PR #118: screenshots of Phase 2 part B

Part B builds the client screens of matching (Path 2): items 2.9 to 2.13 and the reviewers' page (2.12r). They show only on an API run with `MATCHING=true`, as on staging. Production keeps it off, and group 19 shows what the same pages show then.

- **Before:** develop at 10267a4. **After:** 1355ebd, the head of the branch. Every shot that 1355ebd could change was taken again on it. The others were taken on 477e5d6 and show nothing that 1355ebd changes.
- Desktop (1280 px wide) and phone (390 px wide), captured at twice their size, in light and dark, in English and French. The main screens have four variants: desktop light EN, desktop dark FR, phone light FR and phone dark EN. Secondary states have one or two. The keyboard shots marked "390 px window" are a desktop browser at that width, used with the keyboard.
- A screen with a BEFORE shows it right above its AFTER, in the same width, scheme and language. The pairs are desktop light EN and phone light FR, except the recruiter dashboard (all four variants) and the recruiter's account menu (desktop light EN and phone dark EN). A screen without a BEFORE is new in this pull request.
- The fixtures are fictional: the e2e seed's candidates Mia Match (`e2e-match`) and Cleo Card (`e2e-match-card`), its recruiter Rita Recruiter and its reviewer. Through the API, each candidate got experiences with projects and skills and a card headline, and Mia's internship was left off her card. The recruiter got five postings at the fictional companies Acme Logistique and Northwind Data: one not in matching, two near-copies in review that differ only in their pay, one that the reviewer rejected with a reason, and one approved CDD proposed to Mia. The seed's two jobs in matching are there too.
- These happened for real, through the pages or the API. Mia turned discovery on through the page. She was paused by saving her journey without its job match, and the journey was then put back. The decisions, the undos and the keyboard runs were made in the decks. Two mutual interests were made by the recruiter pressing Interested with the keyboard (Cleo on the CDI, Mia on the CDD), and a third by a candidate's answer. Mia confirmed the note on her page for recruiters. Mia then stopped being visible, and turning it on again was refused with the 429.
- These were answered in the browser. Google Calendar's admin routes, the meetings booked, and the free dates and slots, so Google was never asked. `PUT /matches/:id/seen` was dropped, so that the "New" marks stay from one shot to the next. `GET /opportunities` answered `pending: true` for the "travel times still being computed" state, since the e2e API computes no travel times.
- These were moved: the dates that `GET /discovery` answers, only for the "consent ending soon" and "consent ended" states, which only time produces.
- For group 19, the API was started again without `MATCHING` and without `GOOGLE_CLIENT_SECRET`, as in CI's "matching off" leg. Those pages also say that no meeting can be booked online.
- The BEFORE shots come from a worktree at 10267a4 with its own API and database. It got the same fixtures. Mia was turned on and the two mutual interests were made through the API, and Mia's note was confirmed on the page. `/opportunities` is not a page at 10267a4, so the BEFORE candidate menu was opened on Cleo's portfolio. That seed has no reviewer, so no review was decided there, and the 10267a4 client shows nothing of reviews anyway.

The groups, in the order a reader meets part B (the candidate, then the recruiter, the reviewer, the page for recruiters, and matching off):

1. Being found by recruiters: turning it on (2.10)
2. Being found by recruiters: on, paused, ended, stopped (2.10)
3. The card preview (2.10)
4. Get started (2.10)
5. Opportunities: the jobs to review (2.9, 2.11)
6. Opportunities: the deck with the keyboard (2.9, 2.11)
7. Opportunities: consent ending, and why there is no job to review (2.11)
8. Opportunities: mutual interests (2.11)
9. The private page of a job (2.11)
10. The candidate's account menu (2.11)
11. A job's matching panel (2.12)
12. The candidates deck (2.9, 2.12)
13. The candidates deck with the keyboard (2.9, 2.12)
14. Mutual interests on the dashboard (2.12)
15. The job editor's choice (2.12)
16. The recruiter's account menu mark (2.12)
17. The reviewers' page (2.12r)
18. The page for recruiters after a mutual interest (2.13)
19. With MATCHING off

## 1. Being found by recruiters: turning it on (2.10)

**BEFORE: Perfect job tab, no discovery settings at its end. Desktop 1280, light, EN.**

![](01-perfect-job-tab-full-desktop-light-en-before.png)

**AFTER: Perfect job tab in full, ending with Be found by recruiters (on, Open your opportunities). Desktop 1280, light, EN.**

![](01-perfect-job-tab-full-desktop-light-en-after.png)

**BEFORE: The Perfect job tab in full. Phone 390, light, FR.**

![](01-perfect-job-tab-full-phone-light-fr-before.png)

**AFTER: The Perfect job tab in full. Phone 390, light, FR.**

![](01-perfect-job-tab-full-phone-light-fr-after.png)

**AFTER: Off with requirements missing (terms, criteria, pay, journey, calendar, meeting type), each with the way to fix it. Desktop 1280, light, EN.**

![](01-discovery-missing-desktop-light-en-after.png)

**AFTER: Off, requirements missing. Desktop 1280, dark, FR.**

![](01-discovery-missing-desktop-dark-fr-after.png)

**AFTER: Off, requirements missing. Phone 390, light, FR.**

![](01-discovery-missing-phone-light-fr-after.png)

**AFTER: Off, requirements missing. Phone 390, dark, EN.**

![](01-discovery-missing-phone-dark-en-after.png)

**AFTER: Be found by recruiters, off with every requirement met: the card settings (headline, experiences, one left out) and the unticked 18+ consent. Desktop 1280, light, EN.**

![](01-discovery-ready-desktop-light-en-after.png)

**AFTER: Off, every requirement met. Desktop 1280, dark, FR.**

![](01-discovery-ready-desktop-dark-fr-after.png)

**AFTER: Off, every requirement met. Phone 390, light, FR.**

![](01-discovery-ready-phone-light-fr-after.png)

**AFTER: Off, every requirement met. Phone 390, dark, EN.**

![](01-discovery-ready-phone-dark-en-after.png)

**AFTER: Turn on pressed without ticking the consent: refused, focus on the box. Phone 390, light, FR.**

![](01-discovery-consent-unticked-phone-light-fr-after.png)

**AFTER: Turned on without the consent ticked. Phone 390, dark, EN.**

![](01-discovery-consent-unticked-phone-dark-en-after.png)

**AFTER: Right after turning it on through the page: focus on the section heading, "Visible to recruiters since..." read out. Phone 390, dark, EN.**

![](01-discovery-turned-on-phone-dark-en-after.png)

## 2. Being found by recruiters: on, paused, ended, stopped (2.10)

**AFTER: On: since when, consent valid until (dates kept on one line), Open your opportunities, the one bar a job is held to, Stop being visible. Desktop 1280, light, EN.**

![](02-discovery-on-desktop-light-en-after.png)

**AFTER: On. Desktop 1280, dark, FR.**

![](02-discovery-on-desktop-dark-fr-after.png)

**AFTER: On. Phone 390, light, FR.**

![](02-discovery-on-phone-light-fr-after.png)

**AFTER: On. Phone 390, dark, EN.**

![](02-discovery-on-phone-dark-en-after.png)

**AFTER: On, consent in its last 30 days: Open your opportunities, Confirm my consent again (`GET /discovery` dates moved in the browser: time alone makes this state). Desktop 1280, light, EN.**

![](02-discovery-renew-desktop-light-en-after.png)

**AFTER: On, consent in its last 30 days. Phone 390, light, FR.**

![](02-discovery-renew-phone-light-fr-after.png)

**AFTER: Paused for real ("Paused: no recruiter sees your card until what is missing below is set"): the journey saved without its job match step (put back after), with Add the missing steps, and Open your opportunities. Desktop 1280, light, EN.**

![](02-discovery-paused-desktop-light-en-after.png)

**AFTER: Paused. Phone 390, light, FR.**

![](02-discovery-paused-phone-light-fr-after.png)

**AFTER: Consent ended: Give my consent again, Turn it off (dates moved in the browser). Desktop 1280, light, EN.**

![](02-discovery-lapsed-desktop-light-en-after.png)

**AFTER: Consent ended. Phone 390, dark, EN.**

![](02-discovery-lapsed-phone-dark-en-after.png)

**AFTER: Stop being visible asked first (ConfirmDialog, with a border): answers dropped, mutual interests go on, 7 days before turning on again. Phone 390, dark, EN.**

![](02-discovery-stop-dialog-phone-dark-en-after.png)

**AFTER: After Stop being visible: off again, "You can turn it on again from 28 Nov 2026" said, focus on the heading. Phone 390, dark, EN.**

![](02-discovery-stopped-phone-dark-en-after.png)

**AFTER: Opt-in right after a real withdrawal: the 429 of `DISCOVERY_REJOIN_DAYS` (7 days) said as a day and time, button kept focusable. Desktop 1280, light, EN.**

![](02-discovery-rejoin-held-desktop-light-en-after.png)

**AFTER: Opt-in held back after a withdrawal. Phone 390, light, FR.**

![](02-discovery-rejoin-held-phone-light-fr-after.png)

## 3. The card preview (2.10)

**AFTER: Preview my card: the anonymous card as recruiters read it (headline, total time, roles with time and Now, skills with months), then what recruiters read beside it. Desktop 1280, light, EN.**

![](03-card-preview-desktop-light-en-after.png)

**AFTER: The card preview. Desktop 1280, dark, FR.**

![](03-card-preview-desktop-dark-fr-after.png)

**AFTER: The card preview. Phone 390, light, FR.**

![](03-card-preview-phone-light-fr-after.png)

**AFTER: The card preview. Phone 390, dark, EN.**

![](03-card-preview-phone-dark-en-after.png)

**AFTER: Preview my card scrolled to its end: "Beside your card, recruiters read how their job does on: ...", what else a recruiter reads beside it and what it leaves out (the internship hidden). Desktop 1280, light, EN.**

![](03-card-preview-end-desktop-light-en-after.png)

**AFTER: The card preview scrolled to its end. Desktop 1280, dark, FR.**

![](03-card-preview-end-desktop-dark-fr-after.png)

**AFTER: The card preview scrolled to its end. Phone 390, light, FR.**

![](03-card-preview-end-phone-light-fr-after.png)

**AFTER: The card preview scrolled to its end. Phone 390, dark, EN.**

![](03-card-preview-end-phone-dark-en-after.png)

## 4. Get started (2.10)

**BEFORE: Get started, no "Be found by recruiters" card. Desktop 1280, light, EN.**

![](04-get-started-full-desktop-light-en-before.png)

**AFTER: Get started in full, with the optional Be found by recruiters card (Open the settings, Open your opportunities). Desktop 1280, light, EN.**

![](04-get-started-full-desktop-light-en-after.png)

**BEFORE: Get started in full. Phone 390, light, FR.**

![](04-get-started-full-phone-light-fr-before.png)

**AFTER: Get started in full. Phone 390, light, FR.**

![](04-get-started-full-phone-light-fr-after.png)

**AFTER: Get started tab: the optional "Be found by recruiters" card, discovery off. Desktop 1280, light, EN.**

![](04-get-started-discovery-off-desktop-light-en-after.png)

**AFTER: The Get started card, discovery off. Phone 390, dark, EN.**

![](04-get-started-discovery-off-phone-dark-en-after.png)

**AFTER: Get started card, discovery on: since when, Open the settings, Open your opportunities. Desktop 1280, light, EN.**

![](04-get-started-discovery-on-desktop-light-en-after.png)

**AFTER: The Get started card, discovery on. Phone 390, dark, EN.**

![](04-get-started-discovery-on-phone-dark-en-after.png)

**AFTER: Get started card, paused (journey missing its job match): "Paused: something is missing, so no recruiter sees your card.", Open the settings, Open your opportunities. Desktop 1280, light, EN.**

![](04-get-started-discovery-paused-desktop-light-en-after.png)

**AFTER: The Get started card, paused. Phone 390, dark, EN.**

![](04-get-started-discovery-paused-phone-dark-en-after.png)

**AFTER: Get started card, consent ended. Desktop 1280, light, EN.**

![](04-get-started-discovery-lapsed-desktop-light-en-after.png)

**AFTER: The Get started card, consent ended. Phone 390, dark, EN.**

![](04-get-started-discovery-lapsed-phone-dark-en-after.png)

## 5. Opportunities: the jobs to review (2.9, 2.11)

**AFTER: Opportunities, To review: the deck with a job proposed (score and minimum; its outcomes are below the fold, in the full-page shots), Pass / Interested sticky at the bottom on the page's own background. Desktop 1280, light, EN.**

![](05-opportunities-deck-desktop-light-en-after.png)

**AFTER: The deck of jobs to review. Desktop 1280, dark, FR.**

![](05-opportunities-deck-desktop-dark-fr-after.png)

**AFTER: Opportunities, To review: the deck with a job proposed (score and minimum; its outcomes are below the fold, in the full-page shots), Pass / Interested sticky at the bottom on the page's own background, no keyboard hint on a touch screen. Phone 390, touch, light, FR.**

![](05-opportunities-deck-phone-light-fr-after.png)

**AFTER: The deck of jobs to review. Phone 390, touch, dark, EN.**

![](05-opportunities-deck-phone-dark-en-after.png)

**AFTER: The candidate deck as a full page: the job's score and minimum, the outcome of each of its criteria (work mode, contract, pay), the job description, the answers bar opaque at the bottom; no horizontal scroll. Phone 390, touch, light, FR.**

![](05-opportunities-deck-full-phone-light-fr-after.png)

**AFTER: The deck as a full page. Phone 390, touch, dark, EN.**

![](05-opportunities-deck-full-phone-dark-en-after.png)

**AFTER: Travel times still computed (`pending: true` answered in the browser: the e2e API computes no travel times). Desktop 1280, light, EN.**

![](05-opportunities-travel-times-pending-desktop-light-en-after.png)

**AFTER: Travel times still being computed. Phone 390, dark, EN.**

![](05-opportunities-travel-times-pending-phone-dark-en-after.png)

**AFTER: Empty state after passing the last job in the deck: no email promised, the account menu says when both are interested; under it the answers bar on the page's background, "You passed ..." and Undo. Desktop 1280, light, EN.**

![](05-opportunities-empty-desktop-light-en-after.png)

**AFTER: Empty state after answering every job: no email promised, the account menu says when both are interested. Phone 390, dark, EN.**

![](05-opportunities-empty-phone-dark-en-after.png)

**AFTER: Undo then Pass again on the last job: an answer given again offers no Undo, and what the deck said stays in sight alone under the empty state. Desktop 1280, light, EN.**

![](05-opportunities-answer-final-desktop-light-en-after.png)

## 6. Opportunities: the deck with the keyboard (2.9, 2.11)

**AFTER: Candidate deck reached with Tab: focus on Pass, the keyboard hint under the answers. Desktop 1280, keyboard, dark, FR.**

![](06-opportunities-keys-focus-desktop-dark-fr-after.png)

**AFTER: The deck reached with Tab. 390 px window, keyboard, light, EN.**

![](06-opportunities-keys-focus-phone-light-en-after.png)

**AFTER: After ArrowLeft (Pass): the next card, focus on its heading, "You passed..." said under the answers beside Undo, on the opaque bar. Desktop 1280, keyboard, dark, FR.**

![](06-opportunities-keys-passed-desktop-dark-fr-after.png)

**AFTER: After ArrowLeft (Pass). 390 px window, keyboard, light, EN.**

![](06-opportunities-keys-passed-phone-light-en-after.png)

**AFTER: After Z (Undo): the card back on top, focus on its heading, "Undone: ... is back." said under the answers. 390 px window, keyboard, light, EN.**

![](06-opportunities-keys-undone-phone-light-en-after.png)

**AFTER: Z after a Pass on a job already answered once (and undone) in the run before: a decision taken again is final, "Cette réponse ne peut plus être annulée." said, focus kept on the card. Desktop 1280, keyboard, dark, FR.**

![](06-opportunities-keys-undo-final-desktop-dark-fr-after.png)

## 7. Opportunities: consent ending, and why there is no job to review (2.11)

**AFTER: Consent ending within 30 days: when it ends (the date kept on one line) and the link to confirm it again, then the deck (dates moved in the browser). Desktop 1280, dark, FR.**

![](07-opportunities-consent-ending-desktop-dark-fr-after.png)

**AFTER: Consent ending within 30 days. Phone 390, touch, light, FR.**

![](07-opportunities-consent-ending-phone-light-fr-after.png)

**AFTER: Discovery paused for real: each missing requirement. Desktop 1280, dark, FR.**

![](07-opportunities-paused-desktop-dark-fr-after.png)

**AFTER: Discovery paused for real: "Paused: no recruiter sees your card", each missing requirement. Phone 390, dark, EN.**

![](07-opportunities-paused-phone-dark-en-after.png)

**AFTER: Consent ended (dates moved in the browser). Desktop 1280, light, EN.**

![](07-opportunities-consent-ended-desktop-light-en-after.png)

**AFTER: Consent ended. Phone 390, dark, EN.**

![](07-opportunities-consent-ended-phone-dark-en-after.png)

**AFTER: Discovery off: why there is no job, with the way to discovery settings. Desktop 1280, light, EN.**

![](07-opportunities-discovery-off-desktop-light-en-after.png)

**AFTER: Discovery off. Phone 390, dark, EN.**

![](07-opportunities-discovery-off-phone-dark-en-after.png)

**AFTER: An account without a portfolio: the way to create one. Desktop 1280, light, EN.**

![](07-opportunities-no-portfolio-desktop-light-en-after.png)

**AFTER: An account without a portfolio. Phone 390, light, FR.**

![](07-opportunities-no-portfolio-phone-light-fr-after.png)

## 8. Opportunities: mutual interests (2.11)

**AFTER: Mutual interests view: the job said yes to, both interested on, score then, Open the job / End it, marked New (the New and tab count badges darker red). Desktop 1280, light, EN.**

![](08-opportunities-interests-desktop-light-en-after.png)

**AFTER: The mutual interests view. Desktop 1280, dark, FR.**

![](08-opportunities-interests-desktop-dark-fr-after.png)

**AFTER: The mutual interests view. Phone 390, light, FR.**

![](08-opportunities-interests-phone-light-fr-after.png)

**AFTER: The mutual interests view. Phone 390, dark, EN.**

![](08-opportunities-interests-phone-dark-en-after.png)

**AFTER: End it asked first (the dialog with a border): what ending does to the page for recruiters. Desktop 1280, light, EN.**

![](08-opportunities-interests-end-dialog-desktop-light-en-after.png)

**AFTER: End it asked first. Phone 390, dark, EN.**

![](08-opportunities-interests-end-dialog-phone-dark-en-after.png)

**AFTER: Mutual interests view with none. Desktop 1280, dark, FR.**

![](08-opportunities-interests-empty-desktop-dark-fr-after.png)

**AFTER: No mutual interest. Phone 390, dark, EN.**

![](08-opportunities-interests-empty-phone-dark-en-after.png)

## 9. The private page of a job (2.11)

**BEFORE: Private page of a job the feed proposes: the job alone, no score or answer, footer names only the recruiter and journeys. Desktop 1280, light, EN.**

![](09-job-page-proposed-desktop-light-en-before.png)

**AFTER: Private job page of a job proposed by the feed (access feed), before any answer: score, minimum, outcomes, Pass / Interested. Desktop 1280, light, EN.**

![](09-job-page-proposed-desktop-light-en-after.png)

**BEFORE: A job the feed proposes. Phone 390, light, FR.**

![](09-job-page-proposed-phone-light-fr-before.png)

**AFTER: A job the feed proposes. Phone 390, light, FR.**

![](09-job-page-proposed-phone-light-fr-after.png)

**AFTER: A job the feed proposes. Desktop 1280, dark, FR.**

![](09-job-page-proposed-desktop-dark-fr-after.png)

**AFTER: A job the feed proposes. Phone 390, dark, EN.**

![](09-job-page-proposed-phone-dark-en-after.png)

**AFTER: Same page after Interested given there: the answer pressed (primary), its recruiter sees it, Undo offered. Desktop 1280, light, EN.**

![](09-job-page-proposed-answered-desktop-light-en-after.png)

**AFTER: After Interested given there. Phone 390, light, FR.**

![](09-job-page-proposed-answered-phone-light-fr-after.png)

**BEFORE: Private page of a mutual interest's job: nothing says both are interested. Desktop 1280, light, EN.**

![](09-job-page-mutual-interest-desktop-light-en-before.png)

**AFTER: Private job page of a mutual interest (access match): "You're both interested", since when, End it. Desktop 1280, light, EN.**

![](09-job-page-mutual-interest-desktop-light-en-after.png)

**BEFORE: A mutual interest's job. Phone 390, light, FR.**

![](09-job-page-mutual-interest-phone-light-fr-before.png)

**AFTER: A mutual interest's job. Phone 390, light, FR.**

![](09-job-page-mutual-interest-phone-light-fr-after.png)

**AFTER: A mutual interest's job. Desktop 1280, dark, FR.**

![](09-job-page-mutual-interest-desktop-dark-fr-after.png)

**AFTER: A mutual interest's job. Phone 390, dark, EN.**

![](09-job-page-mutual-interest-phone-dark-en-after.png)

## 10. The candidate's account menu (2.11)

**BEFORE: Candidate account menu (opened on the portfolio: `/opportunities` is not a page at 10267a4), no Opportunities. Desktop 1280, light, EN.**

![](10-candidate-menu-desktop-light-en-before.png)

**AFTER: Candidate account menu: Opportunities with the badge of unseen mutual interests (1 new / 1 nouveau). Desktop 1280, light, EN.**

![](10-candidate-menu-desktop-light-en-after.png)

**BEFORE: The candidate's account menu. Phone 390, light, FR.**

![](10-candidate-menu-phone-light-fr-before.png)

**AFTER: The candidate's account menu. Phone 390, light, FR.**

![](10-candidate-menu-phone-light-fr-after.png)

**AFTER: The candidate's account menu. Desktop 1280, dark, FR.**

![](10-candidate-menu-desktop-dark-fr-after.png)

**AFTER: The candidate's account menu. Phone 390, dark, EN.**

![](10-candidate-menu-phone-dark-en-after.png)

**AFTER: Header with the menu closed, cut at its bottom edge: the dot on the initials (its name says "1 new mutual interest"). Desktop 1280, light, EN.**

![](10-candidate-menu-closed-desktop-light-en-after.png)

**AFTER: The header, menu closed. Desktop 1280, dark, FR.**

![](10-candidate-menu-closed-desktop-dark-fr-after.png)

**AFTER: The header, menu closed. Phone 390, light, FR.**

![](10-candidate-menu-closed-phone-light-fr-after.png)

**AFTER: The header, menu closed. Phone 390, dark, EN.**

![](10-candidate-menu-closed-phone-dark-en-after.png)

## 11. A job's matching panel (2.12)

**BEFORE: Posting page, no matching panel. Desktop 1280, light, EN.**

![](11-job-page-full-desktop-light-en-before.png)

**AFTER: Posting page with the matching panel (proposed to candidates) and its mutual interest, its actions in one column. Desktop 1280, light, EN.**

![](11-job-page-full-desktop-light-en-after.png)

**BEFORE: The posting page in full. Phone 390, light, FR.**

![](11-job-page-full-phone-light-fr-before.png)

**AFTER: The posting page in full. Phone 390, light, FR.**

![](11-job-page-full-phone-light-fr-after.png)

**AFTER: Posting page panel, not in matching: the switch off, a reviewer reads it first. Desktop 1280, light, EN.**

![](11-panel-off-desktop-light-en-after.png)

**AFTER: Not in matching. Phone 390, dark, EN.**

![](11-panel-off-phone-dark-en-after.png)

**AFTER: Panel, in review: proposed to nobody until a reviewer approves it. Desktop 1280, light, EN.**

![](11-panel-in-review-desktop-light-en-after.png)

**AFTER: In review. Desktop 1280, dark, FR.**

![](11-panel-in-review-desktop-dark-fr-after.png)

**AFTER: In review. Phone 390, light, FR.**

![](11-panel-in-review-phone-light-fr-after.png)

**AFTER: In review. Phone 390, dark, EN.**

![](11-panel-in-review-phone-dark-en-after.png)

**AFTER: Panel, not accepted: the reviewer's reason as written, Edit / Duplicate, what turning it off frees. Desktop 1280, light, EN.**

![](11-panel-not-accepted-desktop-light-en-after.png)

**AFTER: Not accepted. Phone 390, light, FR.**

![](11-panel-not-accepted-phone-light-fr-after.png)

**AFTER: Panel, proposed to candidates: "Candidates to review" with a neutral icon and Review candidates (candidates waiting, never how many), no mutual interest yet. Desktop 1280, light, EN.**

![](11-panel-proposed-desktop-light-en-after.png)

**AFTER: Proposed to candidates. Desktop 1280, dark, FR.**

![](11-panel-proposed-desktop-dark-fr-after.png)

**AFTER: Proposed to candidates. Phone 390, light, FR.**

![](11-panel-proposed-phone-light-fr-after.png)

**AFTER: Proposed to candidates. Phone 390, dark, EN.**

![](11-panel-proposed-phone-dark-en-after.png)

**AFTER: Panel after the mutual interest: no candidate left to review, the job's mutual interest with its actions in one column, each icon beside its label. Desktop 1280, light, EN.**

![](11-panel-mutual-interest-desktop-light-en-after.png)

**AFTER: After the mutual interest. Phone 390, light, FR.**

![](11-panel-mutual-interest-phone-light-fr-after.png)

## 12. The candidates deck (2.9, 2.12)

**AFTER: Candidates to review: the anonymous card (headline, total, roles, skills, outcomes beside it), one at a time; Interested primary, the answers bar opaque. Desktop 1280, light, EN.**

![](12-candidates-deck-desktop-light-en-after.png)

**AFTER: The anonymous card. Desktop 1280, dark, FR.**

![](12-candidates-deck-desktop-dark-fr-after.png)

**AFTER: Candidates to review: the anonymous card (headline, total, roles, skills, outcomes beside it), one at a time; Interested primary, the answers bar opaque, no keyboard hint on a touch screen. Phone 390, touch, light, FR.**

![](12-candidates-deck-phone-light-fr-after.png)

**AFTER: The anonymous card. Phone 390, touch, dark, EN.**

![](12-candidates-deck-phone-dark-en-after.png)

**AFTER: The card after the candidate said the job interests them: "Interested in your job" badge (primary). Desktop 1280, light, EN.**

![](12-candidates-deck-interested-desktop-light-en-after.png)

**AFTER: The card after the candidate said the job interests them: "Votre offre l'intéresse" badge (primary). Phone 390, touch, light, FR.**

![](12-candidates-deck-interested-phone-light-fr-after.png)

**AFTER: Interested pressed with the keyboard on an interested candidate: "You're both interested", the portfolio revealed, focus on the heading, its actions primary (made for real, the CDI job). Desktop 1280, light, EN.**

![](12-candidates-both-interested-desktop-light-en-after.png)

**AFTER: Interested pressed with the keyboard on an interested candidate: "You're both interested", the portfolio revealed, focus on the heading, its actions primary (made for real, the CDD job). Phone 390, dark, EN.**

![](12-candidates-both-interested-phone-dark-en-after.png)

**AFTER: Recruiter deck as a full page: "No other candidate for now", no count; the answers on the page's own background, no grey slab behind them. Desktop 1280, light, EN.**

![](12-candidates-deck-full-desktop-light-en-after.png)

**AFTER: The deck as a full page. Desktop 1280, dark, FR.**

![](12-candidates-deck-full-desktop-dark-fr-after.png)

**AFTER: The deck as a full page. Phone 390, touch, light, FR.**

![](12-candidates-deck-full-phone-light-fr-after.png)

**AFTER: The deck as a full page. Phone 390, touch, dark, EN.**

![](12-candidates-deck-full-phone-dark-en-after.png)

**AFTER: No candidate to review right now: how candidates come, no email promised. Desktop 1280, dark, FR.**

![](12-candidates-none-desktop-dark-fr-after.png)

**AFTER: No candidate to review. Phone 390, light, FR.**

![](12-candidates-none-phone-light-fr-after.png)

## 13. The candidates deck with the keyboard (2.9, 2.12)

**AFTER: Recruiter deck reached with Tab: focus on Pass, the opaque answers bar (nothing of the card shows through it). 390 px window, keyboard, light, EN.**

![](13-candidates-keys-focus-phone-light-en-after.png)

**AFTER: After ArrowLeft (Pass) on the only card: empty state, focus on its heading, "You passed this candidate." said beside Undo on the opaque bar. 390 px window, keyboard, light, EN.**

![](13-candidates-keys-passed-phone-light-en-after.png)

**AFTER: After Z (Undo): the card back, focus on its heading, "Undone: the candidate is back." said under the answers. 390 px window, keyboard, light, EN.**

![](13-candidates-keys-undone-phone-light-en-after.png)

## 14. Mutual interests on the dashboard (2.12)

**BEFORE: Dashboard, no mutual interests, no review label on the job cards. Desktop 1280, light, EN.**

![](14-dashboard-desktop-light-en-before.png)

**AFTER: Dashboard: mutual interests after the meetings (one New), "Go to their page for recruiters" primary, then the job cards with where each stands with the reviewers. Desktop 1280, light, EN.**

![](14-dashboard-desktop-light-en-after.png)

**BEFORE: The recruiter dashboard. Desktop 1280, dark, FR.**

![](14-dashboard-desktop-dark-fr-before.png)

**AFTER: The recruiter dashboard. Desktop 1280, dark, FR.**

![](14-dashboard-desktop-dark-fr-after.png)

**BEFORE: The recruiter dashboard. Phone 390, light, FR.**

![](14-dashboard-phone-light-fr-before.png)

**AFTER: The recruiter dashboard. Phone 390, light, FR.**

![](14-dashboard-phone-light-fr-after.png)

**BEFORE: The recruiter dashboard. Phone 390, dark, EN.**

![](14-dashboard-phone-dark-en-before.png)

**AFTER: The recruiter dashboard. Phone 390, dark, EN.**

![](14-dashboard-phone-dark-en-after.png)

**AFTER: The dashboard's mutual interests list alone (one New). Desktop 1280, light, EN.**

![](14-dashboard-interests-desktop-light-en-after.png)

**AFTER: The mutual interests list alone. Phone 390, dark, EN.**

![](14-dashboard-interests-phone-dark-en-after.png)

## 15. The job editor's choice (2.12)

**BEFORE: New job, status Open, company optional, no "Propose it to candidates". Desktop 1280, light, EN.**

![](15-editor-new-open-desktop-light-en-before.png)

**AFTER: New job, status Open: "Propose it to candidates" ticked, the company then required ("they see the company's name..."), Openings without a unit. Desktop 1280, light, EN.**

![](15-editor-new-open-desktop-light-en-after.png)

**BEFORE: A new job, status Open. Phone 390, light, FR.**

![](15-editor-new-open-phone-light-fr-before.png)

**AFTER: A new job, status Open. Phone 390, light, FR.**

![](15-editor-new-open-phone-light-fr-after.png)

**AFTER: A new job, status Open. Desktop 1280, dark, FR.**

![](15-editor-new-open-desktop-dark-fr-after.png)

**AFTER: A new job, status Open. Phone 390, dark, EN.**

![](15-editor-new-open-phone-dark-en-after.png)

**AFTER: New job, status Draft: proposed from its page once it is open; Openings without a unit. Desktop 1280, light, EN.**

![](15-editor-new-draft-desktop-light-en-after.png)

**AFTER: A new job, status Draft. Phone 390, dark, EN.**

![](15-editor-new-draft-phone-dark-en-after.png)

**AFTER: Editor of a job proposed to candidates: changes apply once saved, a job picked before versions were kept read as it is now; a saved change goes back for review. Desktop 1280, light, EN.**

![](15-editor-in-matching-desktop-light-en-after.png)

**AFTER: Editor of a job proposed to candidates, from its heading through the matching note: changes apply once saved, the locked terms, a saved change goes back for review. Phone 390, light, FR.**

![](15-editor-in-matching-phone-light-fr-after.png)

## 16. The recruiter's account menu mark (2.12)

**BEFORE: Recruiter account menu, no New mark. Desktop 1280, light, EN.**

![](16-recruiter-menu-desktop-light-en-before.png)

**AFTER: Recruiter account menu: Recruiter space marked New (darker red), no number. Desktop 1280, light, EN.**

![](16-recruiter-menu-desktop-light-en-after.png)

**BEFORE: The recruiter's account menu. Phone 390, dark, EN.**

![](16-recruiter-menu-phone-dark-en-before.png)

**AFTER: The recruiter's account menu. Phone 390, dark, EN.**

![](16-recruiter-menu-phone-dark-en-after.png)

**AFTER: Recruiter header, menu closed, cut at its bottom edge: the dot on the initials. Desktop 1280, light, EN.**

![](16-recruiter-menu-closed-desktop-light-en-after.png)

**AFTER: The header, menu closed. Phone 390, dark, EN.**

![](16-recruiter-menu-closed-phone-dark-en-after.png)

## 17. The reviewers' page (2.12r)

**AFTER: Jobs to review: how many wait, the posting as candidates read it. Desktop 1280, light, EN.**

![](17-reviews-desktop-light-en-after.png)

**AFTER: Jobs to review. Desktop 1280, dark, FR.**

![](17-reviews-desktop-dark-fr-after.png)

**AFTER: Jobs to review. Phone 390, light, FR.**

![](17-reviews-phone-light-fr-after.png)

**AFTER: Jobs to review. Phone 390, dark, EN.**

![](17-reviews-phone-dark-en-after.png)

**AFTER: Reviewers' page in full: recruiter email domain and key, other jobs with the copy flagged (differs in pay) and linked (link style), Approve / reason / Reject. Desktop 1280, light, EN.**

![](17-reviews-full-desktop-light-en-after.png)

**AFTER: The reviewers' page in full. Phone 390, dark, EN.**

![](17-reviews-full-phone-dark-en-after.png)

**AFTER: Reject pressed without a reason: the reason asked for on the field. Desktop 1280, light, EN.**

![](17-reviews-reject-no-reason-desktop-light-en-after.png)

**AFTER: Reject without a reason. Phone 390, dark, EN.**

![](17-reviews-reject-no-reason-phone-dark-en-after.png)

**AFTER: Approve asked first (the dialog with a border): « l'offre « ... » est proposée... » while open and its recruiter accepted the terms, cannot be taken back here. Phone 390, light, FR.**

![](17-reviews-approve-dialog-phone-light-fr-after.png)

**AFTER: A recruiter who is not a reviewer: "Not available", nothing says what the page is. Desktop 1280, light, EN.**

![](17-reviews-not-available-desktop-light-en-after.png)

**AFTER: A recruiter who is not a reviewer: "Indisponible", nothing says what the page is. Phone 390, light, FR.**

![](17-reviews-not-available-phone-light-fr-after.png)

## 18. The page for recruiters after a mutual interest (2.13)

**BEFORE: Candidate's page for recruiters with a mutual interest: no banner, Before you start, the steps as for anyone. Desktop 1280, light, EN.**

![](18-hire-mutual-interest-desktop-light-en-before.png)

**AFTER: Candidate's page for recruiters, mutual interest: banner (job, holds it, still to do: the note, what happens once booked, End it) above the steps, note to do. Desktop 1280, light, EN.**

![](18-hire-mutual-interest-desktop-light-en-after.png)

**BEFORE: The page for recruiters with a mutual interest, note to do. Phone 390, light, FR.**

![](18-hire-mutual-interest-phone-light-fr-before.png)

**AFTER: Candidate's page for recruiters, mutual interest: banner above the steps, note to do. Phone 390, light, FR.**

![](18-hire-mutual-interest-phone-light-fr-after.png)

**AFTER: Candidate's page for recruiters, mutual interest: banner (job, holds it, still to do: the note, what happens once booked, End it) above the steps, note to do. Desktop 1280, dark, FR.**

![](18-hire-mutual-interest-desktop-dark-fr-after.png)

**AFTER: Candidate's page for recruiters, mutual interest: banner above the steps, note to do. Phone 390, dark, EN.**

![](18-hire-mutual-interest-phone-dark-en-after.png)

**AFTER: Job step while the note before it is to do: says what it holds. Desktop 1280, light, EN.**

![](18-hire-job-step-locked-desktop-light-en-after.png)

**AFTER: The job step while the note is to do. Phone 390, light, FR.**

![](18-hire-job-step-locked-phone-light-fr-after.png)

**AFTER: Job match while the note before it is to do: the frozen score said. Desktop 1280, light, EN.**

![](18-hire-job-match-locked-desktop-light-en-after.png)

**AFTER: The job match while the note is to do. Phone 390, light, FR.**

![](18-hire-job-match-locked-phone-light-fr-after.png)

**BEFORE: Job step unfolded after a mutual interest: the whole job list, another job could be shared. Desktop 1280, light, EN.**

![](18-hire-job-step-desktop-light-en-before.png)

**AFTER: Job step unfolded: the job you are both interested in, no list, no Change. Desktop 1280, light, EN.**

![](18-hire-job-step-desktop-light-en-after.png)

**BEFORE: The job step unfolded. Phone 390, light, FR.**

![](18-hire-job-step-phone-light-fr-before.png)

**AFTER: The job step unfolded. Phone 390, light, FR.**

![](18-hire-job-step-phone-light-fr-after.png)

**BEFORE: Job match unfolded: a live score, nothing says it was frozen. Desktop 1280, light, EN.**

![](18-hire-job-match-desktop-light-en-before.png)

**AFTER: Job match unfolded: score when you were both interested, no longer changes, outcomes. Desktop 1280, light, EN.**

![](18-hire-job-match-desktop-light-en-after.png)

**BEFORE: The job match unfolded. Phone 390, light, FR.**

![](18-hire-job-match-phone-light-fr-before.png)

**AFTER: The job match unfolded. Phone 390, light, FR.**

![](18-hire-job-match-phone-light-fr-after.png)

**BEFORE: Page for recruiters after the note, mutual interest made through the API: job step done with Change, Before you start still shown, no banner. Desktop 1280, light, EN.**

![](18-hire-after-note-desktop-light-en-before.png)

**AFTER: Page for recruiters once the note is confirmed: job step holds the job, score frozen, the meeting open (free dates answered in the browser: Google is never asked). Desktop 1280, light, EN.**

![](18-hire-after-note-desktop-light-en-after.png)

**BEFORE: Page for recruiters after the note: job step done with Change, Before you start still shown, no banner. Phone 390, light, FR.**

![](18-hire-after-note-phone-light-fr-before.png)

**AFTER: Page for recruiters once the note is confirmed: job step holds the job, score frozen, the meeting open. Phone 390, light, FR.**

![](18-hire-after-note-phone-light-fr-after.png)

**AFTER: Page for recruiters once the note is confirmed: job step holds the job, score frozen, the meeting open (free dates answered in the browser). Phone 390, dark, EN.**

![](18-hire-after-note-phone-dark-en-after.png)

## 19. With MATCHING off

**AFTER: MATCHING unset: candidate menu without Opportunities, `/opportunities` behind it "Not available" with the eye-slash icon. Desktop 1280, light, EN.**

![](19-off-candidate-menu-desktop-light-en-after.png)

**AFTER: API with MATCHING unset: `/opportunities` says only "Not available" (eye-slash icon, as the other pages of matching), neutral header. Desktop 1280, light, EN.**

![](19-off-opportunities-desktop-light-en-after.png)

**AFTER: MATCHING unset: the opportunities page. Phone 390, dark, EN.**

![](19-off-opportunities-phone-dark-en-after.png)

**AFTER: MATCHING unset: Get started without the "Be found by recruiters" card. Desktop 1280, light, EN.**

![](19-off-get-started-desktop-light-en-after.png)

**AFTER: MATCHING unset (and no Google Calendar secret, as the CI off leg): Perfect job tab without discovery settings. Desktop 1280, light, EN.**

![](19-off-perfect-job-tab-desktop-light-en-after.png)

**AFTER: MATCHING unset: posting page without the matching panel. Desktop 1280, light, EN.**

![](19-off-job-page-desktop-light-en-after.png)

**AFTER: MATCHING unset: dashboard without mutual interests or review labels. Desktop 1280, light, EN.**

![](19-off-dashboard-desktop-light-en-after.png)

**AFTER: MATCHING unset: a job's candidates page "Not available" (the posting carries no matching), with Go to the home page. Desktop 1280, dark, FR.**

![](19-off-candidates-desktop-dark-fr-after.png)

**AFTER: MATCHING unset: a job's candidates page. Phone 390, dark, EN.**

![](19-off-candidates-phone-dark-en-after.png)

**AFTER: MATCHING unset: the page for recruiters without the banner (no calendar secret on this API, as the CI off leg: no meeting online). Desktop 1280, light, EN.**

![](19-off-hire-desktop-light-en-after.png)

**AFTER: MATCHING unset: the reviewers' page "Not available" even for the reviewer. Desktop 1280, light, EN.**

![](19-off-reviews-desktop-light-en-after.png)

**AFTER: MATCHING unset: the reviewers' page. Phone 390, light, FR.**

![](19-off-reviews-phone-light-fr-after.png)
