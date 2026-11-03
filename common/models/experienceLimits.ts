// Length and count limits of an experience, shared by the API (request
// validation) and the client (form validation). Generous bounds: they only
// stop abusive payloads (documents are served on every public GET /domain/:name).
export const EXPERIENCE_LIMITS = {
	title: 300,
	projectName: 300,
	/** Markdown summaries (experience and project) */
	text: 20_000,
	companyName: 200,
	companySummary: 5_000,
	location: 200,
	skillName: 100,
	projects: 50,
	/** Per list: technical skills and soft skills each */
	skillsPerProject: 100,
	/** Icon data URL (base64 of the encoded image, with its prefix) */
	icon: 32_768
} as const;
