// Texts of the components that show a job posting: JobCard, JobDetails, JobStatusBadge. What a
// posting says (its facts, its status) is named by `#services/jobPosting.ts`.
import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** A posting without a title (a draft), in a card and as the page's heading */
	untitled: { en: 'Untitled job description', fr: "Offre d'emploi sans titre" },
	/** Heading of the facts (read by screen readers only) */
	keyFacts: { en: 'Key facts', fr: 'Informations clés' },
	/** Heading of the description */
	about: { en: 'About the job', fr: 'À propos du poste' },
	noDescription: { en: 'No description yet.', fr: 'Pas encore de description.' },
	/** Before the badge's text, for screen readers */
	status: { en: 'Status:', fr: 'Statut :' }
});
