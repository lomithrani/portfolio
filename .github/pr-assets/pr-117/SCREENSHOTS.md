# PR #117: screenshots of Phase 2 part A

Part A ships no matching screen: matching is server only, behind `MATCHING`, which is off. What a person sees change is the job step of a page for recruiters (item 2.2: the version of the job shared), the owner's private page of the job, and the privacy policy's "Hiring journey and meetings" section.

- **Before:** develop at 1c1eeaa. **After:** a5b3e84, the head once the final review was addressed.
- Desktop and phone (390 px), light and dark, English and French. The fixtures are fictional: Camille Martin's portfolio and the recruiter Alex Durand at Northwind Logistics.
- Answered in the browser: the 429 of group 5, and the meeting's dates in the two full pages of group 3, since Google cannot be reached. The pick of group 7, the out-of-date terms of group 8 and the broken posting of group 9 were written to the database directly.
- Group 9: a range opened wider than 1.5 times its bottom does not cause the 422, because the share narrows it to the cap. The broken posting shown has a bottom above its top (70k–60k).
- Group 8 also fixes a wrong message. Before, a shared job whose recruiter had not accepted the terms in force said the job was "open now: pick an open job description".

## 1. Job step, nothing shared yet: the line under the jobs

**BEFORE: job step with nothing shared yet, desktop light EN. The line under the jobs reads "Camille Martin sees the job you pick in the meeting invitation."**

![](01-job-step-nothing-shared-desktop-light-en-before.png)

**AFTER: same state, desktop light EN. It now reads "Camille Martin reads the job as you share it now, linked in the meeting invitation. If you edit it later, you can share the new version here."**

![](01-job-step-nothing-shared-desktop-light-en-after.png)

**BEFORE: nothing shared yet, desktop dark EN**

![](01-job-step-nothing-shared-desktop-dark-en-before.png)

**AFTER: nothing shared yet, desktop dark EN**

![](01-job-step-nothing-shared-desktop-dark-en-after.png)

**BEFORE: nothing shared yet, desktop light FR (« Camille Martin voit l'offre que vous choisissez dans l'invitation au rendez-vous. »)**

![](01-job-step-nothing-shared-desktop-light-fr-before.png)

**AFTER: nothing shared yet, desktop light FR (« Camille Martin lit l'offre telle que vous la partagez maintenant, dont le lien figure dans l'invitation au rendez-vous. Si vous la modifiez ensuite, vous pourrez partager la nouvelle version ici. »)**

![](01-job-step-nothing-shared-desktop-light-fr-after.png)

**BEFORE: nothing shared yet, mobile 390 light EN**

![](01-job-step-nothing-shared-mobile-light-en-before.png)

**AFTER: nothing shared yet, mobile 390 light EN**

![](01-job-step-nothing-shared-mobile-light-en-after.png)

**BEFORE: nothing shared yet, mobile 390 dark FR**

![](01-job-step-nothing-shared-mobile-dark-fr-before.png)

**AFTER: nothing shared yet, mobile 390 dark FR**

![](01-job-step-nothing-shared-mobile-dark-fr-after.png)

**BEFORE: the whole page for recruiters with nothing shared yet ("Propose a role to Camille Martin", Before you start, job step open, later steps locked), desktop light EN**

![](01-hire-nothing-shared-full-desktop-light-en-before.png)

**AFTER: the whole page for recruiters with nothing shared yet, desktop light EN. Only the line under the jobs differs.**

![](01-hire-nothing-shared-full-desktop-light-en-after.png)

**BEFORE: the whole page with nothing shared yet, mobile 390 light EN**

![](01-hire-nothing-shared-full-mobile-light-en-before.png)

**AFTER: the whole page with nothing shared yet, mobile 390 light EN**

![](01-hire-nothing-shared-full-mobile-light-en-after.png)

## 2. Job step, shared and unchanged since

**BEFORE: job shared and unchanged, step folded, desktop light EN ("Senior Backend Engineer · Northwind Logistics")**

![](02-job-step-shared-folded-desktop-light-en-before.png)

**AFTER: shared and unchanged, folded, desktop light EN. Same line as before.**

![](02-job-step-shared-folded-desktop-light-en-after.png)

**BEFORE: shared and unchanged, folded, desktop light FR**

![](02-job-step-shared-folded-desktop-light-fr-before.png)

**AFTER: shared and unchanged, folded, desktop light FR**

![](02-job-step-shared-folded-desktop-light-fr-after.png)

**BEFORE: shared and unchanged, unfolded with Change, desktop light EN. The step does not say when or what was shared.**

![](02-job-step-shared-unfolded-desktop-light-en-before.png)

**AFTER: shared and unchanged, unfolded, desktop light EN. A new box reads "You shared Senior Backend Engineer · Northwind Logistics on 20 Nov 2026: Camille Martin reads that version." There is no button because nothing changed.**

![](02-job-step-shared-unfolded-desktop-light-en-after.png)

**BEFORE: shared and unchanged, unfolded, desktop dark EN**

![](02-job-step-shared-unfolded-desktop-dark-en-before.png)

**AFTER: shared and unchanged, unfolded, desktop dark EN (the box border in dark mode)**

![](02-job-step-shared-unfolded-desktop-dark-en-after.png)

**BEFORE: shared and unchanged, unfolded, desktop light FR**

![](02-job-step-shared-unfolded-desktop-light-fr-before.png)

**AFTER: shared and unchanged, unfolded, desktop light FR (« Vous avez partagé Senior Backend Engineer · Northwind Logistics le 20 nov. 2026 : Camille Martin lit cette version. »)**

![](02-job-step-shared-unfolded-desktop-light-fr-after.png)

**BEFORE: shared and unchanged, unfolded, mobile 390 light EN**

![](02-job-step-shared-unfolded-mobile-light-en-before.png)

**AFTER: shared and unchanged, unfolded, mobile 390 light EN**

![](02-job-step-shared-unfolded-mobile-light-en-after.png)

**BEFORE: shared and unchanged, unfolded, mobile 390 dark FR**

![](02-job-step-shared-unfolded-mobile-dark-fr-before.png)

**AFTER: shared and unchanged, unfolded, mobile 390 dark FR**

![](02-job-step-shared-unfolded-mobile-dark-fr-after.png)

## 3. Job step, posting changed since it was shared: Share the new version

**BEFORE: posting edited (its description) after it was shared, step folded, desktop light EN. Nothing tells the recruiter about the edit.**

![](03-job-step-changed-folded-desktop-light-en-before.png)

**AFTER: edited since shared, folded, desktop light EN. The line reads "Senior Backend Engineer · Northwind Logistics: changed since you shared it."**

![](03-job-step-changed-folded-desktop-light-en-after.png)

**BEFORE: edited since shared, folded, desktop light FR**

![](03-job-step-changed-folded-desktop-light-fr-before.png)

**AFTER: edited since shared, folded, desktop light FR (« … : modifiée depuis que vous l'avez partagée. »)**

![](03-job-step-changed-folded-desktop-light-fr-after.png)

**BEFORE: edited since shared, folded, mobile 390 light EN**

![](03-job-step-changed-folded-mobile-light-en-before.png)

**AFTER: edited since shared, folded, mobile 390 light EN**

![](03-job-step-changed-folded-mobile-light-en-after.png)

**BEFORE: edited since shared, folded, mobile 390 light FR**

![](03-job-step-changed-folded-mobile-light-fr-before.png)

**AFTER: edited since shared, folded, mobile 390 light FR**

![](03-job-step-changed-folded-mobile-light-fr-after.png)

**BEFORE: edited since shared, unfolded, desktop light EN**

![](03-job-step-changed-unfolded-desktop-light-en-before.png)

**AFTER: edited since shared, unfolded, desktop light EN. Shows the "You shared … on 20 Nov 2026" line, then "This job description changed since you shared it: Camille Martin still reads, and the steps after this one still use, the version shared." and a "Share the new version" button.**

![](03-job-step-changed-unfolded-desktop-light-en-after.png)

**BEFORE: edited since shared, unfolded, desktop dark EN**

![](03-job-step-changed-unfolded-desktop-dark-en-before.png)

**AFTER: edited since shared, unfolded, desktop dark EN (the primary button in dark mode)**

![](03-job-step-changed-unfolded-desktop-dark-en-after.png)

**BEFORE: edited since shared, unfolded, desktop light FR**

![](03-job-step-changed-unfolded-desktop-light-fr-before.png)

**AFTER: edited since shared, unfolded, desktop light FR (« Cette offre a été modifiée depuis que vous l'avez partagée : … », « Partager la nouvelle version »)**

![](03-job-step-changed-unfolded-desktop-light-fr-after.png)

**BEFORE: edited since shared, unfolded, desktop dark FR**

![](03-job-step-changed-unfolded-desktop-dark-fr-before.png)

**AFTER: edited since shared, unfolded, desktop dark FR**

![](03-job-step-changed-unfolded-desktop-dark-fr-after.png)

**BEFORE: edited since shared, unfolded, mobile 390 light EN**

![](03-job-step-changed-unfolded-mobile-light-en-before.png)

**AFTER: edited since shared, unfolded, mobile 390 light EN (the button fits, nothing is cut off)**

![](03-job-step-changed-unfolded-mobile-light-en-after.png)

**BEFORE: edited since shared, unfolded, mobile 390 dark EN**

![](03-job-step-changed-unfolded-mobile-dark-en-before.png)

**AFTER: edited since shared, unfolded, mobile 390 dark EN**

![](03-job-step-changed-unfolded-mobile-dark-en-after.png)

**BEFORE: edited since shared, unfolded, mobile 390 light FR**

![](03-job-step-changed-unfolded-mobile-light-fr-before.png)

**AFTER: edited since shared, unfolded, mobile 390 light FR (« Partager la nouvelle version » fits at 390 px)**

![](03-job-step-changed-unfolded-mobile-light-fr-after.png)

**BEFORE: edited since shared, unfolded, mobile 390 dark FR**

![](03-job-step-changed-unfolded-mobile-dark-fr-before.png)

**AFTER: edited since shared, unfolded, mobile 390 dark FR**

![](03-job-step-changed-unfolded-mobile-dark-fr-after.png)

**BEFORE: edited since shared, phone viewport (390x844) with the step scrolled to the top, light EN**

![](03-job-step-changed-viewport-mobile-light-en-before.png)

**AFTER: edited since shared, phone viewport with the step scrolled to the top, light EN: what a recruiter sees first**

![](03-job-step-changed-viewport-mobile-light-en-after.png)

**BEFORE: edited since shared, phone viewport, light FR**

![](03-job-step-changed-viewport-mobile-light-fr-before.png)

**AFTER: edited since shared, phone viewport, light FR**

![](03-job-step-changed-viewport-mobile-light-fr-after.png)

**BEFORE: the whole page for recruiters after the edit (job step done, job scored 100, meeting open with its calendar), desktop light EN**

![](03-hire-changed-full-desktop-light-en-before.png)

**AFTER: the whole page after the edit, desktop light EN. The job step says "changed since you shared it". The later steps still go by the version shared ("Get the job scored" 100/100, meeting open).**

![](03-hire-changed-full-desktop-light-en-after.png)

**BEFORE: the whole page after the edit, mobile 390 light EN**

![](03-hire-changed-full-mobile-light-en-before.png)

**AFTER: the whole page after the edit, mobile 390 light EN**

![](03-hire-changed-full-mobile-light-en-after.png)

## 4. The owner's private page of the job: the version shared

**BEFORE: the job's private page (/opportunities/:id) as the owner Camille Martin sees it after the recruiter edited the posting, desktop light EN. It shows the posting as it is now, dated "Updated 20 Nov 2026".**

![](04-opportunity-owner-desktop-light-en-before.png)

**AFTER: same, desktop light EN. It shows the version shared, dated "Shared with you 20 Nov 2026" in place of "Updated".**

![](04-opportunity-owner-desktop-light-en-after.png)

**BEFORE: owner's private page, desktop dark EN**

![](04-opportunity-owner-desktop-dark-en-before.png)

**AFTER: owner's private page, desktop dark EN ("Shared with you 20 Nov 2026")**

![](04-opportunity-owner-desktop-dark-en-after.png)

**BEFORE: owner's private page, desktop light FR (« Mise à jour le 20 nov. 2026 »)**

![](04-opportunity-owner-desktop-light-fr-before.png)

**AFTER: owner's private page, desktop light FR (« Partagée avec vous le 20 nov. 2026 »)**

![](04-opportunity-owner-desktop-light-fr-after.png)

**BEFORE: owner's private page, mobile 390 light EN**

![](04-opportunity-owner-mobile-light-en-before.png)

**AFTER: owner's private page, mobile 390 light EN**

![](04-opportunity-owner-mobile-light-en-after.png)

**BEFORE: owner's private page, mobile 390 dark FR**

![](04-opportunity-owner-mobile-dark-fr-before.png)

**AFTER: owner's private page, mobile 390 dark FR**

![](04-opportunity-owner-mobile-dark-fr-after.png)

**BEFORE: owner's private page, whole page, desktop light EN. The description ends with the edit's "Since we last spoke" section, which the recruiter never shared again.**

![](04-opportunity-owner-full-desktop-light-en-before.png)

**AFTER: owner's private page, whole page, desktop light EN. The description is the version shared, without the later edit.**

![](04-opportunity-owner-full-desktop-light-en-after.png)

**BEFORE: owner's private page, whole page, desktop light FR (with the edited section)**

![](04-opportunity-owner-full-desktop-light-fr-before.png)

**AFTER: owner's private page, whole page, desktop light FR (the version shared)**

![](04-opportunity-owner-full-desktop-light-fr-after.png)

**BEFORE: owner's private page, whole page, mobile 390 light EN (with the edited section)**

![](04-opportunity-owner-full-mobile-light-en-before.png)

**AFTER: owner's private page, whole page, mobile 390 light EN (the version shared)**

![](04-opportunity-owner-full-mobile-light-en-after.png)

## 5. A share refused: the day's limit on a journey that scores jobs (429)

**AFTER only: "Share the new version" refused with a 429, answered in the browser. Under the buttons: "Each job shared here is scored, so you can share at most 5 a day on this page. Try again tomorrow." Desktop light EN.**

![](05-job-step-too-many-desktop-light-en-after.png)

**AFTER: 429 message, desktop dark EN**

![](05-job-step-too-many-desktop-dark-en-after.png)

**AFTER: 429 message, desktop light FR (« Chaque offre partagée ici est notée : vous pouvez en partager au plus 5 par jour sur cette page. Réessayez demain. »)**

![](05-job-step-too-many-desktop-light-fr-after.png)

**AFTER: 429 message, mobile 390 light EN**

![](05-job-step-too-many-mobile-light-en-after.png)

**AFTER: 429 message, mobile 390 dark FR**

![](05-job-step-too-many-mobile-dark-fr-after.png)

## 6. The new version shared

**AFTER only: "Share the new version" pressed for real, with the toast "New version shared". Desktop light EN, viewport.**

![](06-new-version-shared-toast-desktop-light-en-after.png)

**AFTER: the step after the new version was shared, desktop light EN. The "changed since" line and the button are gone.**

![](06-job-step-after-new-version-desktop-light-en-after.png)

**AFTER: toast « Nouvelle version partagée », mobile 390 light FR**

![](06-new-version-shared-toast-mobile-light-fr-after.png)

**AFTER: the step after the new version was shared, folded, mobile 390 light FR**

![](06-job-step-after-new-version-mobile-light-fr-after.png)

## 7. A pick from before versions were kept (shared again to go on)

**AFTER only: a pick stored before versions were kept (written in the database: the job id and a date). The step is open again with the job preselected and reads "Pick Senior Backend Engineer again to share it and go on." Desktop light EN.**

![](07-job-step-picked-before-versions-desktop-light-en-after.png)

**AFTER: pick from before versions, desktop light FR (« Choisissez à nouveau Senior Backend Engineer pour la partager et continuer. »)**

![](07-job-step-picked-before-versions-desktop-light-fr-after.png)

**AFTER: pick from before versions, mobile 390 light EN**

![](07-job-step-picked-before-versions-mobile-light-en-after.png)

## 8. Job shared, recruiter has not accepted the terms in force

**BEFORE: a job shared, then the recruiter's acceptance made older than the terms in force. The line wrongly reads "Senior Backend Engineer is open now: pick an open job description." above the terms box. Desktop light EN.**

![](08-job-step-terms-not-accepted-desktop-light-en-before.png)

**AFTER: same state, desktop light EN. The line now reads "Accept the terms of use in force to go on with Senior Backend Engineer." above the terms box.**

![](08-job-step-terms-not-accepted-desktop-light-en-after.png)

**BEFORE: terms not accepted, desktop light FR (« … a maintenant le statut « Ouverte » : choisissez une offre ouverte. »)**

![](08-job-step-terms-not-accepted-desktop-light-fr-before.png)

**AFTER: terms not accepted, desktop light FR (« Acceptez les conditions d'utilisation en vigueur pour continuer avec Senior Backend Engineer. »)**

![](08-job-step-terms-not-accepted-desktop-light-fr-after.png)

**BEFORE: terms not accepted, mobile 390 light EN**

![](08-job-step-terms-not-accepted-mobile-light-en-before.png)

**AFTER: terms not accepted, mobile 390 light EN**

![](08-job-step-terms-not-accepted-mobile-light-en-after.png)

## 9. A posting that cannot be shared as it is (422)

**AFTER only: picking a posting saved under rules it no longer passes (a third open posting written in the database with its pay bottom over its top) is refused with a 422. The API's message is shown: "This job description cannot be shared as it is: correct it in your recruiter space, or duplicate it if what needs correcting is locked, then pick the corrected one here". Desktop light EN.**

![](09-job-step-cannot-share-desktop-light-en-after.png)

**AFTER: 422 refusal, desktop light FR (the API's message in French)**

![](09-job-step-cannot-share-desktop-light-fr-after.png)

**AFTER: 422 refusal, mobile 390 light EN**

![](09-job-step-cannot-share-mobile-light-en-after.png)

## 10. Privacy policy: the version shared (no LEGAL_VERSION bump)

**BEFORE: Privacy policy, the #data-journey section (Hiring journey and meetings), desktop light EN**

![](10-privacy-journey-desktop-light-en-before.png)

**AFTER: #data-journey, desktop light EN. Adds that the job description is kept as the recruiter shared it, that this version is what the owner reads and what is scored, and that later edits change neither until shared again. Also adds "(each owner reads there the version shared in their journey)".**

![](10-privacy-journey-desktop-light-en-after.png)

**BEFORE: #data-journey, desktop light FR**

![](10-privacy-journey-desktop-light-fr-before.png)

**AFTER: #data-journey, desktop light FR**

![](10-privacy-journey-desktop-light-fr-after.png)

**BEFORE: #data-journey, mobile 390 light EN**

![](10-privacy-journey-mobile-light-en-before.png)

**AFTER: #data-journey, mobile 390 light EN**

![](10-privacy-journey-mobile-light-en-after.png)

**BEFORE: #data-journey, mobile 390 light FR**

![](10-privacy-journey-mobile-light-fr-before.png)

**AFTER: #data-journey, mobile 390 light FR**

![](10-privacy-journey-mobile-light-fr-after.png)

**BEFORE: Privacy policy, the recipients item "Portfolio owners", desktop light EN**

![](10-privacy-recipients-owners-desktop-light-en-before.png)

**AFTER: recipients "Portfolio owners", desktop light EN (adds "as the recruiter shared it")**

![](10-privacy-recipients-owners-desktop-light-en-after.png)

**BEFORE: recipients « Les propriétaires de portfolio », desktop light FR**

![](10-privacy-recipients-owners-desktop-light-fr-before.png)

**AFTER: recipients, desktop light FR (adds « telle qu'il l'a partagée »)**

![](10-privacy-recipients-owners-desktop-light-fr-after.png)

**BEFORE: recipients, mobile 390 light EN**

![](10-privacy-recipients-owners-mobile-light-en-before.png)

**AFTER: recipients, mobile 390 light EN**

![](10-privacy-recipients-owners-mobile-light-en-after.png)

**BEFORE: recipients, mobile 390 light FR**

![](10-privacy-recipients-owners-mobile-light-fr-before.png)

**AFTER: recipients, mobile 390 light FR**

![](10-privacy-recipients-owners-mobile-light-fr-after.png)

**BEFORE: retention table from its header down to the row "Your progress in other portfolios' journeys", desktop light EN**

![](10-privacy-retention-row-desktop-light-en-before.png)

**AFTER: retention row, desktop light EN. Now "… with the version of the job description you shared there", kept "…; the version of a job description, at the latest until you delete that job description".**

![](10-privacy-retention-row-desktop-light-en-after.png)

**BEFORE: retention row, desktop light FR**

![](10-privacy-retention-row-desktop-light-fr-before.png)

**AFTER: retention row, desktop light FR**

![](10-privacy-retention-row-desktop-light-fr-after.png)

**BEFORE: retention row, mobile 390 light EN**

![](10-privacy-retention-row-mobile-light-en-before.png)

**AFTER: retention row, mobile 390 light EN**

![](10-privacy-retention-row-mobile-light-en-after.png)

**BEFORE: retention row, mobile 390 light FR**

![](10-privacy-retention-row-mobile-light-fr-before.png)

**AFTER: retention row, mobile 390 light FR**

![](10-privacy-retention-row-mobile-light-fr-after.png)

