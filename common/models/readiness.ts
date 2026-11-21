// What a candidate still has to set up before they share the link of their portfolio, as the API
// answers it (GET /me/readiness, computed by candidateReadiness of
// server/services/candidateReadiness.ts, the one place that decides it). It says what the account
// has, never what it holds: how many criteria are rated and which, not what they ask for; the
// types of the journey's steps, not their settings. The onboarding of the landing page and the
// admin's checklist read it (client/src/services/candidateSetup.ts), and so do the requirements
// of discovery (matching.ts: discoveryRequirements), so the two never disagree.

/** GET /me/readiness */
export interface CandidateReadiness {
	/** The address name of the portfolio the account owns; null until it claims one */
	domain: string | null;
	/** The experiences of that portfolio */
	experiences: number;
	perfectJob: {
		/** How many criteria are rated */
		criteria: number;
		/**
		 * Whether the criteria that tell most jobs apart are rated: the pay, the work mode, where
		 * the office is (the cities, or the commute while the API computes travel times: off, the
		 * commute is left out of every score) and the contract types
		 */
		essentials: { pay: boolean; workMode: boolean; place: boolean; contractTypes: boolean };
	};
	journey: {
		/** false: the owner never saved a journey, and has the default one (a meeting step only) */
		saved: boolean;
		/** The types of its steps, in order ('' for a stored step that is not one) */
		types: string[];
		/**
		 * A step before the meeting can never succeed, so recruiters never reach the meeting: its
		 * type is not one this version has (a stored step that is not one, a type removed since), or
		 * a step type it needs is not before it. Only a journey written by hand or by an older
		 * version (PUT /workflow refuses both); `gate` and `meeting` are then false
		 */
		blocked: boolean;
		/**
		 * Recruiters share a job, which is scored against the perfect job, before they can book: a
		 * job step, then a job match, then a meeting (the gate template, journeyTemplate), whatever
		 * comes between them and whatever their settings
		 */
		gate: boolean;
		/** It leads to a meeting recruiters can reach */
		meeting: boolean;
	};
	calendar: {
		/** The API takes Google Calendar connections (GOOGLE_CLIENT_SECRET) */
		configured: boolean;
		/** A grant is stored */
		connected: boolean;
		/** Google refused the stored grant, and the owner has not connected again since */
		reconnect: boolean;
		/**
		 * The meeting types (Appointments tab) recruiters can book: turned on, with hours (weekly
		 * hours, or a day of their own with hours, from yesterday on). One turned on without hours
		 * offers no slot: not counted
		 */
		enabledSchedules: number;
	};
}
