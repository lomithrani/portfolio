# PR #116 screenshots

Phase 1b: share your link. Desktop 1280 × 800 and phone 390 × 844, at device scale 2, against the real app running locally (seeded MongoDB; Google's sign-in script stubbed; `GET /me/readiness` answered in the browser only where a caption says so). Before = `develop` at ca87206; after = this branch at 9eed69f / 6945bd5. The last commit, d54f053, changed a few words after these captures (no line of one word in the French FAQ and How it works titles, "Per year" in the Share tab, the note step's "confirm that you have read it"). The `localhost:4173` host is the local capture's.

## 1. Landing page (1.12)

Before (develop) and after. The header now reads "The career page you keep"; the hero "Your career, on your terms. The pay first. The call after."; new sections Send your link (with the journey demo), Our promises to you; new FAQ answers.

**Hero, desktop, English: before / after**

![01 landing hero desktop light en before](01-landing-hero-desktop-light-en-before.png)

![01 landing hero desktop light en after](01-landing-hero-desktop-light-en-after.png)

**Hero, desktop, French (after)**

![01 landing hero desktop light fr after](01-landing-hero-desktop-light-fr-after.png)

**Hero, phone 390 px: English before / English after / French after**

<img src="01-landing-hero-mobile-light-en-before.png" alt="01 landing hero mobile light en before" width="260"> <img src="01-landing-hero-mobile-light-en-after.png" alt="01 landing hero mobile light en after" width="260"> <img src="01-landing-hero-mobile-light-fr-after.png" alt="01 landing hero mobile light fr after" width="260">

**Whole page, desktop, English: before / after**

<img src="01-landing-full-desktop-light-en-before.png" alt="01 landing full desktop light en before" width="420"> <img src="01-landing-full-desktop-light-en-after.png" alt="01 landing full desktop light en after" width="420">

**Whole page, desktop, French, dark (after)**

<img src="01-landing-full-desktop-dark-fr-after.png" alt="01 landing full desktop dark fr after" width="420">

**Whole page, phone: English light / French dark (after)**

<img src="01-landing-full-mobile-light-en-after.png" alt="01 landing full mobile light en after" width="260"> <img src="01-landing-full-mobile-dark-fr-after.png" alt="01 landing full mobile dark fr after" width="260">

**New FAQ answers opened (Do I ever pay? / Does having a portfolio mean I'm looking? / Is Portfolio only for senior profiles? / How does Portfolio make money?): English / French**

<img src="01-landing-faq-new-opened-desktop-light-en-after.png" alt="01 landing faq new opened desktop light en after" width="420"> <img src="01-landing-faq-new-opened-desktop-light-fr-after.png" alt="01 landing faq new opened desktop light fr after" width="420">

## 2. Landing card, step 4 "Set your terms" (1.8)

Signed in as an owner with two experiences, nothing else set; then once everything is set (readiness answered in the browser).

**Step 4: desktop English / phone French dark**

<img src="02-landing-card-step4-desktop-light-en-after.png" alt="02 landing card step4 desktop light en after" width="380"> <img src="02-landing-card-step4-mobile-dark-fr-after.png" alt="02 landing card step4 mobile dark fr after" width="380">

**"Your link is ready": desktop English / phone French**

<img src="02-landing-card-ready-desktop-light-en-after.png" alt="02 landing card ready desktop light en after" width="380"> <img src="02-landing-card-ready-mobile-light-fr-after.png" alt="02 landing card ready mobile light fr after" width="380">

## 3. Admin, Get started tab (1.8)

A checklist read from GET /me/readiness: experiences, what you want, your steps (the gate journey offered in one click), calendar, your link.

**Nothing set: desktop English / phone English**

<img src="03-get-started-incomplete-desktop-light-en-after.png" alt="03 get started incomplete desktop light en after" width="420"> <img src="03-get-started-incomplete-mobile-light-en-after.png" alt="03 get started incomplete mobile light en after" width="420">

**The gate choice: desktop English / phone French / desktop French dark**

<img src="03-get-started-gate-choice-desktop-light-en-after.png" alt="03 get started gate choice desktop light en after" width="300"> <img src="03-get-started-gate-choice-mobile-light-fr-after.png" alt="03 get started gate choice mobile light fr after" width="300"> <img src="03-get-started-gate-choice-desktop-dark-fr-after.png" alt="03 get started gate choice desktop dark fr after" width="300">

**"Change the note first" opened**

<img src="03-get-started-gate-note-opened-desktop-light-en-after.png" alt="03 get started gate note opened desktop light en after" width="600">

**Right after "Use these steps" (from the state of the gate choice above)**

![03 get started gate saved desktop light en after](03-get-started-gate-saved-desktop-light-en-after.png)

**Complete (calendar answered in the browser): desktop French dark / phone English**

<img src="03-get-started-complete-desktop-dark-fr-after.png" alt="03 get started complete desktop dark fr after" width="420"> <img src="03-get-started-complete-mobile-light-en-after.png" alt="03 get started complete mobile light en after" width="420">

## 4. Perfect job: Start with the essentials (1.8)

**Offered: desktop English / desktop French**

<img src="04-perfect-job-essentials-offered-desktop-light-en-after.png" alt="04 perfect job essentials offered desktop light en after" width="420"> <img src="04-perfect-job-essentials-offered-desktop-light-fr-after.png" alt="04 perfect job essentials offered desktop light fr after" width="420">

**After pressing it, phone (scrolled by the app to the place, below the tab row)**

<img src="04-perfect-job-essentials-started-mobile-light-en-after.png" alt="04 perfect job essentials started mobile light en after" width="260">

## 5. Share tab (1.9)

Nothing on this tab is saved or sent. The texts are written in the language the owner picks, whatever the page's.

**Link copied, phone**

<img src="05-share-link-copied-mobile-light-en-after.png" alt="05 share link copied mobile light en after" width="260">

**Reply and LinkedIn text in English: light / dark**

<img src="05-share-reply-en-desktop-light-en-after.png" alt="05 share reply en desktop light en after" width="420"> <img src="05-share-reply-en-desktop-dark-en-after.png" alt="05 share reply en desktop dark en after" width="420">

**The texts switched to French on an English page**

![05 share reply fr desktop light en after](05-share-reply-fr-desktop-light-en-after.png)

**"The pay I ask for" ticked, filled in from the perfect job: desktop / whole tab on a phone**

<img src="05-share-fact-pay-desktop-light-en-after.png" alt="05 share fact pay desktop light en after" width="420"> <img src="05-share-fact-pay-full-mobile-light-en-after.png" alt="05 share fact pay full mobile light en after" width="420">

**Calendar not open: the tab says why both texts give the portfolio**

<img src="05-share-calendar-closed-desktop-light-en-after.png" alt="05 share calendar closed desktop light en after" width="600">

## 6. Floating corner and rail: "Hire me" becomes "Propose a role" (1.9)

A visitor's view of a portfolio.

**Corner, desktop English: before / after**

<img src="06-corner-desktop-light-en-before.png" alt="06 corner desktop light en before" width="420"> <img src="06-corner-desktop-light-en-after.png" alt="06 corner desktop light en after" width="420">

**Corner, phone French: before / after / after dark**

<img src="06-corner-mobile-light-fr-before.png" alt="06 corner mobile light fr before" width="260"> <img src="06-corner-mobile-light-fr-after.png" alt="06 corner mobile light fr after" width="260"> <img src="06-corner-mobile-dark-fr-after.png" alt="06 corner mobile dark fr after" width="260">

**Rail opened, desktop French: before / after**

<img src="06-rail-open-desktop-light-fr-before.png" alt="06 rail open desktop light fr before" width="420"> <img src="06-rail-open-desktop-light-fr-after.png" alt="06 rail open desktop light fr after" width="420">

## 7. Page for recruiters, rendered on the server with "Before you start" (1.9, 1.11)

The gate journey of a fixture portfolio with a meeting type to book.

**Desktop: before / after**

<img src="07-page-for-recruiters-desktop-light-en-before.png" alt="07 page for recruiters desktop light en before" width="420"> <img src="07-page-for-recruiters-desktop-light-en-after.png" alt="07 page for recruiters desktop light en after" width="420">

**Phone, dark (after)**

<img src="07-page-for-recruiters-mobile-dark-en-after.png" alt="07 page for recruiters mobile dark en after" width="260">

**Whole page: desktop French / phone English (after)**

<img src="07-page-for-recruiters-full-desktop-light-fr-after.png" alt="07 page for recruiters full desktop light fr after" width="300"> <img src="07-page-for-recruiters-full-mobile-light-en-after.png" alt="07 page for recruiters full mobile light en after" width="300">

**JavaScript off, phone (default dark theme): before ("Loading availability…" only) / after (title, Before you start, the steps)**

<img src="07-page-for-recruiters-nojs-full-mobile-default-dark-en-before.png" alt="07 page for recruiters nojs full mobile default dark en before" width="260"> <img src="07-page-for-recruiters-nojs-full-mobile-default-dark-en-after.png" alt="07 page for recruiters nojs full mobile default dark en after" width="260">

## 8. Experiences page: progress link (1.8)

**With two experiences, desktop / empty portfolio, phone**

<img src="08-experiences-progress-desktop-light-en-after.png" alt="08 experiences progress desktop light en after" width="380"> <img src="08-experiences-progress-empty-mobile-light-en-after.png" alt="08 experiences progress empty mobile light en after" width="380">

## 9. Account menu: "Share your link" (1.9)

**Desktop English / phone French dark**

<img src="09-account-menu-desktop-light-en-after.png" alt="09 account menu desktop light en after" width="380"> <img src="09-account-menu-mobile-dark-fr-after.png" alt="09 account menu mobile dark fr after" width="380">

## 10. Link preview images (1.10, 1.12)

1200 × 630, shown by LinkedIn, Slack and the like.

**Landing: before / after English / after French**

<img src="10-share-image-og-image-before.png" alt="10 share image og image before" width="300"> <img src="10-share-image-og-image-after.png" alt="10 share image og image after" width="300"> <img src="10-share-image-og-image-fr-after.png" alt="10 share image og image fr after" width="300">

**New: a portfolio, English / French**

<img src="10-share-image-og-portfolio-after.png" alt="10 share image og portfolio after" width="420"> <img src="10-share-image-og-portfolio-fr-after.png" alt="10 share image og portfolio fr after" width="420">

**New: a page for recruiters, English / French**

<img src="10-share-image-og-hire-after.png" alt="10 share image og hire after" width="420"> <img src="10-share-image-og-hire-fr-after.png" alt="10 share image og hire fr after" width="420">
