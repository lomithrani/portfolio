# Screenshots of PR #115

Captured with Playwright against the production build and a local seeded database (Google's button stubbed). Before is `develop` at f1c072b.

### Recruiter landing: the terms box comes first, Google only once it is ticked

| Before | After, unticked | After, ticked |
|---|---|---|
| <img src="1-recruiter-landing-desktop-light-before.png" width="300" alt="1-recruiter-landing-desktop-light-before"> | <img src="1-recruiter-landing-desktop-light-after-unticked.png" width="300" alt="1-recruiter-landing-desktop-light-after-unticked"> | <img src="1-recruiter-landing-desktop-light-after-ticked.png" width="300" alt="1-recruiter-landing-desktop-light-after-ticked"> |

| Mobile, unticked | Mobile, ticked |
|---|---|
| <img src="1-recruiter-landing-mobile-light-after-unticked.png" width="260" alt="1-recruiter-landing-mobile-light-after-unticked"> | <img src="1-recruiter-landing-mobile-light-after-ticked.png" width="260" alt="1-recruiter-landing-mobile-light-after-ticked"> |

(Their header subtitle was shortened afterwards to "Your job descriptions and your meetings", as in the dashboard shot below.)

### A recruiter whose terms are older than the current version

| Desktop | Mobile |
|---|---|
| <img src="2-recruiter-stale-terms-desktop-light-after.png" width="420" alt="2-recruiter-stale-terms-desktop-light-after"> | <img src="2-recruiter-stale-terms-mobile-light-after.png" width="260" alt="2-recruiter-stale-terms-mobile-light-after"> |

### Recruiter's job page: no public page, no applicants

| Before | After |
|---|---|
| <img src="3-recruiter-job-desktop-light-before-full.png" width="420" alt="3-recruiter-job-desktop-light-before-full"> | <img src="3-recruiter-job-desktop-light-after-full.png" width="420" alt="3-recruiter-job-desktop-light-after-full"> |
| <img src="3-recruiter-job-desktop-dark-before.png" width="420" alt="3-recruiter-job-desktop-dark-before"> | <img src="3-recruiter-job-desktop-dark-after.png" width="420" alt="3-recruiter-job-desktop-dark-after"> |

| Mobile before | Mobile after | Mobile after, dark | Dashboard, mobile |
|---|---|---|---|
| <img src="3-recruiter-job-mobile-light-before.png" width="200" alt="3-recruiter-job-mobile-light-before"> | <img src="3-recruiter-job-mobile-light-after.png" width="200" alt="3-recruiter-job-mobile-light-after"> | <img src="3-recruiter-job-mobile-dark-after.png" width="200" alt="3-recruiter-job-mobile-dark-after"> | <img src="8-recruiter-dashboard-mobile-light-after.png" width="200" alt="8-recruiter-dashboard-mobile-light-after"> |

### Private job view `/opportunities/[id]`

| Signed out | Not shared with you (mobile) |
|---|---|
| <img src="4-opportunity-signed-out-desktop-light-after.png" width="420" alt="4-opportunity-signed-out-desktop-light-after"> | <img src="4-opportunity-not-shared-mobile-light-after.png" width="260" alt="4-opportunity-not-shared-mobile-light-after"> |

| Shared with this portfolio owner | Mobile |
|---|---|
| <img src="4-opportunity-loaded-desktop-light-after-full.png" width="420" alt="4-opportunity-loaded-desktop-light-after-full"> | <img src="4-opportunity-loaded-mobile-light-after.png" width="260" alt="4-opportunity-loaded-mobile-light-after"> |

### No "Browse jobs" in the footer and the account menu

| Footer before | Footer after | Menu before | Menu after |
|---|---|---|---|
| <img src="5-footer-mobile-light-before.png" width="200" alt="5-footer-mobile-light-before"> | <img src="5-footer-mobile-light-after.png" width="200" alt="5-footer-mobile-light-after"> | <img src="5-account-menu-mobile-light-before.png" width="200" alt="5-account-menu-mobile-light-before"> | <img src="5-account-menu-mobile-light-after.png" width="200" alt="5-account-menu-mobile-light-after"> |

### Landing FAQ "Who can see my portfolio?"

| English | French |
|---|---|
| <img src="6-landing-faq-desktop-light-after-en.png" width="420" alt="6-landing-faq-desktop-light-after-en"> | <img src="6-landing-faq-desktop-light-after-fr.png" width="420" alt="6-landing-faq-desktop-light-after-fr"> |

### Hire page job step, signed out (its sign-in button moved to `components/hire/SignInButton.svelte`)

| Light | Dark |
|---|---|
| <img src="7-hire-job-step-mobile-light-after.png" width="260" alt="7-hire-job-step-mobile-light-after"> | <img src="7-hire-job-step-mobile-dark-after.png" width="260" alt="7-hire-job-step-mobile-dark-after"> |

### Pay: how it is compared and the 1.5× cap (job editor)

| Before | After | Range too wide |
|---|---|---|
| <img src="b-1-editor-pay-desktop-light-en-before.png" width="300" alt="1-editor-pay-desktop-light-en-before"> | <img src="b-1-editor-pay-desktop-light-en-after.png" width="300" alt="1-editor-pay-desktop-light-en-after"> | <img src="b-1-editor-pay-too-wide-desktop-light-en-after.png" width="300" alt="1-editor-pay-too-wide-desktop-light-en-after"> |

| Too wide, mobile | Too wide, French |
|---|---|
| <img src="b-1-editor-pay-too-wide-mobile-light-en-after.png" width="260" alt="1-editor-pay-too-wide-mobile-light-en-after"> | <img src="b-1-editor-pay-too-wide-desktop-light-fr-after.png" width="420" alt="1-editor-pay-too-wide-desktop-light-fr-after"> |

### Pay criterion in the owner's Perfect job tab

| Before | After | French |
|---|---|---|
| <img src="b-6-perfect-job-pay-desktop-light-en-before.png" width="300" alt="6-perfect-job-pay-desktop-light-en-before"> | <img src="b-6-perfect-job-pay-desktop-light-en-after.png" width="300" alt="6-perfect-job-pay-desktop-light-en-after"> | <img src="b-6-perfect-job-pay-desktop-light-fr-after.png" width="300" alt="6-perfect-job-pay-desktop-light-fr-after"> |

### Confirmation before a job is first opened

| From the status control | From the editor (dark) | Mobile |
|---|---|---|
| <img src="b-2-open-dialog-status-desktop-light-after.png" width="320" alt="2-open-dialog-status-desktop-light-after"> | <img src="b-2-open-dialog-editor-desktop-dark-after.png" width="320" alt="2-open-dialog-editor-desktop-dark-after"> | <img src="b-2-open-dialog-status-mobile-light-after.png" width="200" alt="2-open-dialog-status-mobile-light-after"> |

### An opened job: locked terms, Duplicate

| Editor's note | Locked pay (dark) | Mobile |
|---|---|---|
| <img src="b-3-locked-editor-top-desktop-light-after.png" width="320" alt="3-locked-editor-top-desktop-light-after"> | <img src="b-3-locked-editor-pay-desktop-dark-after.png" width="320" alt="3-locked-editor-pay-desktop-dark-after"> | <img src="b-3-locked-editor-top-mobile-light-after.png" width="200" alt="3-locked-editor-top-mobile-light-after"> |

| Job page | Job page, mobile | Duplicate: a new draft |
|---|---|---|
| <img src="b-4-recruiter-job-desktop-light-after.png" width="320" alt="4-recruiter-job-desktop-light-after"> | <img src="b-4-recruiter-job-mobile-light-after.png" width="200" alt="4-recruiter-job-mobile-light-after"> | <img src="b-5-duplicate-desktop-light-after.png" width="320" alt="5-duplicate-desktop-light-after"> |

