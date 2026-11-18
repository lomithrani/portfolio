// Texts of jobPosting.ts: how the editor names a posting's fields and what it says of a number
// it cannot read, and how every page showing a posting writes its facts (pay, contract, working
// time, team). The labels of a posting's values (status, work mode, contract type, pay
// period...) and the rules' messages are portfolio-common's.
import { defineMessages, plural, type ContractType } from 'portfolio-common';

/** A number field holding something else. In French the field's name comes first, as in the rules */
const notANumber = (en: string, fr: string) => ({
	en: `${en} must be a number`,
	fr: `${fr} : indiquez un nombre`
});

const monthsEn = (count: number) => `${count} ${plural(count, 'month', 'months')}`;

/** A number as French writes it: '37,5' */
const frNumber = (value: number) => value.toLocaleString('fr-FR');

/** What the French contract names mean, for candidates who do not know them */
const CONTRACT_GLOSSES_EN: Partial<Record<ContractType, string>> = {
	cdi: 'permanent',
	cdd: 'fixed-term'
};

export const m = defineMessages({
	// --- The editor's form --------------------------------------------------------------------

	/** How the editor names each field (its label; the error summary's links) */
	fieldLabels: {
		title: { en: 'Job title', fr: 'Intitulé du poste' },
		company: { en: 'Company', fr: 'Entreprise' },
		status: { en: 'Status', fr: 'Statut' },
		openings: { en: 'Openings', fr: 'Postes à pourvoir' },
		description: { en: 'Description', fr: 'Description' },
		workMode: { en: 'Work mode', fr: 'Mode de travail' },
		city: { en: 'City', fr: 'Ville' },
		postalCode: { en: 'Postal code', fr: 'Code postal' },
		address: { en: 'Address', fr: 'Adresse' },
		remoteDaysPerWeek: { en: 'Remote days a week', fr: 'Jours de télétravail par semaine' },
		contractType: { en: 'Contract type', fr: 'Type de contrat' },
		durationMonths: { en: 'Duration', fr: 'Durée' },
		startDate: { en: 'Start date', fr: 'Date de début' },
		trialPeriodMonths: { en: 'Trial period', fr: "Période d'essai" },
		collectiveAgreement: { en: 'Collective agreement', fr: 'Convention collective' },
		arrangement: { en: 'Working time', fr: 'Temps de travail' },
		hoursPerWeek: { en: 'Hours per week', fr: 'Heures par semaine' },
		daysPerYear: { en: 'Days per year', fr: 'Jours par an' },
		rttDaysPerYear: { en: 'RTT days per year', fr: 'Jours de RTT par an' },
		payMin: { en: 'Minimum pay', fr: 'Rémunération minimale' },
		payMax: { en: 'Maximum pay', fr: 'Rémunération maximale' },
		payPeriod: { en: 'Pay period', fr: 'Période de rémunération' },
		payVariable: { en: 'Variable pay', fr: 'Rémunération variable' },
		directReports: { en: 'Direct reports', fr: 'Personnes encadrées' },
		peers: { en: 'Peers under the same manager', fr: 'Pairs sous le même responsable' },
		levelsToCeo: { en: 'Levels to the CEO', fr: "Niveaux jusqu'à la direction générale" },
		seniority: { en: 'Seniority', fr: "Niveau d'expérience" },
		education: { en: 'Education', fr: "Niveau d'études" },
		skills: { en: 'Skills', fr: 'Compétences' },
		languages: { en: 'Languages', fr: 'Langues' },
		benefits: { en: 'Benefits', fr: 'Avantages' },
		travel: { en: 'Travel', fr: 'Déplacements' }
	},
	/** What was typed in a number field is not a number */
	notANumber: {
		openings: notANumber('Openings', 'Nombre de postes'),
		remoteDaysPerWeek: notANumber('Remote days per week', 'Jours de télétravail par semaine'),
		durationMonths: notANumber('Duration', 'Durée'),
		trialPeriodMonths: notANumber('Trial period', "Période d'essai"),
		hoursPerWeek: notANumber('Hours per week', 'Heures par semaine'),
		daysPerYear: notANumber('Days per year', 'Jours par an'),
		rttDaysPerYear: notANumber('RTT days', 'Jours de RTT'),
		payMin: notANumber('Minimum pay', 'Rémunération minimale'),
		payMax: notANumber('Maximum pay', 'Rémunération maximale'),
		directReports: notANumber('Direct reports', 'Personnes encadrées'),
		peers: notANumber('Peers', 'Pairs'),
		levelsToCeo: notANumber('Levels to the CEO', "Niveaux jusqu'à la direction générale")
	},
	payMinRequired: {
		en: 'Minimum pay is required',
		fr: 'Indiquez la rémunération minimale'
	},
	payMaxRequired: {
		en: 'Maximum pay is required',
		fr: 'Indiquez la rémunération maximale'
	},
	/**
	 * What each status means for the posting (the editor's hint, the toast of a status change):
	 * no status makes it public, only an open one can be picked on a candidate's page for recruiters
	 */
	statusDescriptions: {
		draft: { en: 'Only you can see it.', fr: 'Vous seul pouvez la voir.' },
		open: {
			en: "Hiring: you can pick it on a candidate's page for recruiters.",
			fr: "Recrutement en cours : vous pouvez la choisir sur la page recruteurs d'un candidat."
		},
		on_hold: {
			en: 'Paused: it cannot be picked for now.',
			fr: 'En pause : elle ne peut pas être choisie pour le moment.'
		},
		filled: {
			en: 'Marked as filled: it can no longer be picked.',
			fr: 'Marquée comme pourvue : elle ne peut plus être choisie.'
		},
		closed: {
			en: 'Marked as closed: it can no longer be picked.',
			fr: 'Marquée comme fermée : elle ne peut plus être choisie.'
		}
	},

	// --- A posting's facts --------------------------------------------------------------------

	/**
	 * '€45,000 – €55,000 gross per year' (`range`: the amounts; `period`: the pay period as
	 * portfolio-common names it, '' without one)
	 */
	pay: {
		en: (range: string, period: string) => `${range} gross${period ? ` ${period}` : ''}`,
		fr: (range: string, period: string) => `${range} brut${period ? ` ${period}` : ''}`
	},
	/** '39 h/week', '28 h/week (part-time)' */
	hoursPerWeek: {
		en: (hours: number, partTime: boolean) => `${hours} h/week${partTime ? ' (part-time)' : ''}`,
		fr: (hours: number, partTime: boolean) =>
			`${frNumber(hours)} h/semaine${partTime ? ' (temps partiel)' : ''}`
	},
	/** The French term is explained where candidates read it in English */
	daysPerYear: {
		en: (days: number) =>
			`${days} days a year (forfait jours: counted in days worked, no weekly hours)`,
		fr: (days: number) => `${days} ${plural(days, 'jour', 'jours')} par an (forfait jours)`
	},
	rttDays: {
		en: (days: number) =>
			plural(
				days,
				'1 RTT day (an extra day off a year)',
				`${days} RTT days (extra days off a year)`
			),
		fr: (days: number) => `${frNumber(days)} ${plural(days, 'jour', 'jours')} de RTT`
	},
	/** 'Hybrid (2 days remote a week)' (`mode`: the work mode as portfolio-common names it) */
	hybridDays: {
		en: (mode: string, days: number) =>
			`${mode} (${days} ${plural(days, 'day', 'days')} remote a week)`,
		fr: (mode: string, days: number) =>
			`${mode} (${days} ${plural(days, 'jour', 'jours')} de télétravail par semaine)`
	},
	/** '6 months' */
	months: {
		en: monthsEn,
		fr: (count: number) => `${count} mois`
	},
	/** 'Starts 1 Dec 2026' */
	starts: {
		en: (date: string) => `Starts ${date}`,
		fr: (date: string) => `Début : ${date}`
	},
	startsAsap: { en: 'Starts as soon as possible', fr: 'Début dès que possible' },
	/** '3 months trial period' */
	trialPeriod: {
		en: (count: number) => `${monthsEn(count)} trial period`,
		fr: (count: number) => `Période d'essai de ${count} mois`
	},
	/** 'Reports to the CEO', '3 levels below the CEO', 'Is the CEO' */
	levelsToCeo: {
		en: (levels: number) => {
			if (levels === 0) return 'Is the CEO';
			if (levels === 1) return 'Reports to the CEO';
			return `${levels} levels below the CEO`;
		},
		fr: (levels: number) => {
			if (levels === 0) return 'Poste de direction générale';
			if (levels === 1) return 'Rattaché à la direction générale';
			return `${levels} niveaux sous la direction générale`;
		}
	},
	/** '4 direct reports', 'No direct reports' */
	directReports: {
		en: (count: number) =>
			count === 0 ? 'No direct reports' : `${count} direct ${plural(count, 'report', 'reports')}`,
		fr: (count: number) =>
			count === 0
				? 'Aucune personne encadrée'
				: `${count} ${plural(count, 'personne encadrée', 'personnes encadrées')}`
	},
	/** '5 peers under the same manager' */
	peers: {
		en: (count: number) =>
			count === 0
				? 'No peers under the same manager'
				: `${count} ${plural(count, 'peer', 'peers')} under the same manager`,
		fr: (count: number) =>
			count === 0
				? 'Aucun pair sous le même responsable'
				: `${count} ${plural(count, 'pair', 'pairs')} sous le même responsable`
	},
	/** One-word contracts, for one-line summaries: 'CDI', 'CDD', 'Internship' */
	contractShort: {
		cdi: { en: 'CDI', fr: 'CDI' },
		cdd: { en: 'CDD', fr: 'CDD' },
		interim: { en: 'Temporary', fr: 'Intérim' },
		apprenticeship: { en: 'Apprenticeship', fr: 'Apprentissage' },
		professionalisation: { en: 'Work-study', fr: 'Professionnalisation' },
		internship: { en: 'Internship', fr: 'Stage' },
		freelance: { en: 'Freelance', fr: 'Freelance' }
	},
	/**
	 * A short contract with its details: 'CDI (permanent)', 'CDD (fixed-term, 6 months)',
	 * 'Internship (6 months)'. French readers know what a CDI and a CDD are: 'CDD (6 mois)'
	 */
	contractWithDetails: {
		en: (label: string, type: ContractType, durationMonths: number | undefined) => {
			const details = [
				CONTRACT_GLOSSES_EN[type],
				durationMonths ? monthsEn(durationMonths) : ''
			].filter(Boolean);
			return details.length ? `${label} (${details.join(', ')})` : label;
		},
		fr: (label: string, _type: ContractType, durationMonths: number | undefined) =>
			durationMonths ? `${label} (${durationMonths} mois)` : label
	},
	/** '1 position', '3 positions' */
	openings: {
		en: (count: number) => `${count} ${plural(count, 'position', 'positions')}`,
		fr: (count: number) => `${count} ${plural(count, 'poste', 'postes')}`
	},
	/** The names of a posting's facts (jobFacts) */
	facts: {
		place: { en: 'Location', fr: 'Lieu' },
		contract: { en: 'Contract', fr: 'Contrat' },
		workingTime: { en: 'Working time', fr: 'Temps de travail' },
		pay: { en: 'Pay', fr: 'Rémunération' },
		openings: { en: 'Openings', fr: 'Postes à pourvoir' },
		team: { en: 'Team', fr: 'Équipe' },
		profile: { en: 'Profile', fr: 'Profil' },
		skills: { en: 'Skills', fr: 'Compétences' },
		languages: { en: 'Languages', fr: 'Langues' },
		benefits: { en: 'Benefits', fr: 'Avantages' },
		travel: { en: 'Travel', fr: 'Déplacements' }
	},
	/** A line of the contract (`name`: what the recruiter wrote) */
	collectiveAgreement: {
		en: (name: string) => `Collective agreement: ${name}`,
		fr: (name: string) => `Convention collective : ${name}`
	},
	/** A line of the pay (`text`: what the recruiter wrote) */
	variablePay: {
		en: (text: string) => `Variable: ${text}`,
		fr: (text: string) => `Variable : ${text}`
	}
});
