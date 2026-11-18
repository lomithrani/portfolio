import { defineMessages, plural } from 'portfolio-common'

// What the job description import tells the recruiter reviewing the draft: what was left out,
// changed or not found (never what is sent to the model: the prompt and the schema stay as they
// are). A warning names the field it is about. In French the field's name comes first
// ("Intitulé : texte raccourci..."), as in portfolio-common's rules of a posting: it reads well
// whatever the field's gender and number.

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** A list of short texts: items shortened, and a list cut at its cap */
const list = (en: [string, string], fr: { shortened: [string, string]; firstKept: (max: number) => string }) => ({
  shortened: {
    en: (count: number, max: number) =>
      `Shortened ${count} ${plural(count, en[0], en[1])} longer than ${max} characters`,
    fr: (count: number, max: number) =>
      `${count} ${plural(count, fr.shortened[0], fr.shortened[1])} : plus de ${max} caractères`
  },
  firstKept: {
    en: (max: number) => `Only the first ${max} ${en[1]} were kept`,
    fr: fr.firstKept
  }
})

export const m = defineMessages({
  /** The fields of a posting, as the warnings name them */
  fields: {
    title: { en: 'title', fr: 'intitulé' },
    company: { en: 'company', fr: 'entreprise' },
    description: { en: 'description', fr: 'description' },
    openings: { en: 'number of openings', fr: 'nombre de postes' },
    city: { en: 'city', fr: 'ville' },
    address: { en: 'address', fr: 'adresse' },
    workMode: { en: 'work mode', fr: 'mode de travail' },
    remoteDaysPerWeek: { en: 'remote days per week', fr: 'jours de télétravail par semaine' },
    contractType: { en: 'contract type', fr: 'type de contrat' },
    durationMonths: { en: 'contract duration (months)', fr: 'durée du contrat (mois)' },
    contractDuration: { en: 'contract duration', fr: 'durée du contrat' },
    startDate: { en: 'start date', fr: 'date de début' },
    trialPeriodMonths: { en: 'trial period (months)', fr: "période d'essai (mois)" },
    collectiveAgreement: { en: 'collective agreement', fr: 'convention collective' },
    workingTimeArrangement: { en: 'working time arrangement', fr: 'décompte du temps de travail' },
    workingTime: {
      en: 'working time (hours per week or days per year)',
      fr: 'temps de travail (heures par semaine ou jours par an)'
    },
    hoursPerWeek: { en: 'hours per week', fr: 'heures par semaine' },
    daysPerYear: { en: 'days per year', fr: 'jours par an' },
    rttDaysPerYear: { en: 'RTT days per year', fr: 'jours de RTT par an' },
    payMin: { en: 'minimum pay', fr: 'rémunération minimale' },
    payMax: { en: 'maximum pay', fr: 'rémunération maximale' },
    payRange: { en: 'pay range', fr: 'fourchette de rémunération' },
    payPeriod: { en: 'pay period', fr: 'période de rémunération' },
    payVariable: { en: 'variable pay', fr: 'rémunération variable' },
    directReports: { en: 'number of direct reports', fr: 'nombre de personnes encadrées' },
    peers: { en: 'number of peers', fr: 'nombre de pairs' },
    levelsToCeo: { en: 'levels to the CEO', fr: "niveaux jusqu'à la direction générale" },
    seniority: { en: 'seniority', fr: "niveau d'expérience" },
    education: { en: 'education level', fr: "niveau d'études" },
    travel: { en: 'travel frequency', fr: 'fréquence de déplacement' }
  },

  /** What the file gave, in the quotation marks of the language */
  quoted: {
    en: (line: string) => JSON.stringify(line),
    fr: (line: string) => `« ${line} »`
  },
  // `label`: one of the fields above; `quoted`: what the file gave, in quotation marks (above)
  shortened: {
    en: (label: string, max: number) => `Shortened the ${label} to ${max} characters`,
    fr: (label: string, max: number) => `${capital(label)} : texte raccourci à ${max} caractères`
  },
  htmlRemoved: {
    en: (label: string) => `Removed HTML markup from the ${label}`,
    fr: (label: string) => `${capital(label)} : balises HTML retirées`
  },
  notAccepted: {
    en: (label: string, quoted: string) =>
      `Left out the ${label} (${quoted}): it is not one of the accepted values`,
    fr: (label: string, quoted: string) =>
      `${capital(label)} (${quoted}) : valeur ignorée, ce n'est pas l'une des valeurs acceptées`
  },
  notANumber: {
    en: (label: string, quoted: string) => `Left out the ${label} (${quoted}): it is not a number`,
    fr: (label: string, quoted: string) =>
      `${capital(label)} (${quoted}) : valeur ignorée, ce n'est pas un nombre`
  },
  mustBeWhole: {
    en: (label: string, quoted: string, min: number, max: number) =>
      `Left out the ${label} (${quoted}): it must be a whole number from ${min} to ${max}`,
    fr: (label: string, quoted: string, min: number, max: number) =>
      `${capital(label)} (${quoted}) : valeur ignorée, il faut un nombre entier de ${min} à ${max}`
  },
  mustBeHalf: {
    en: (label: string, quoted: string, min: number, max: number) =>
      `Left out the ${label} (${quoted}): it must be from ${min} to ${max} (half hours allowed)`,
    fr: (label: string, quoted: string, min: number, max: number) =>
      `${capital(label)} (${quoted}) : valeur ignorée, il faut un nombre de ${min} à ${max} (demi-heures acceptées)`
  },
  mustBeAmount: {
    en: (label: string, quoted: string, min: number, max: number) =>
      `Left out the ${label} (${quoted}): it must be an amount from ${min} to ${max}`,
    fr: (label: string, quoted: string, min: number, max: number) =>
      `${capital(label)} (${quoted}) : valeur ignorée, il faut un montant de ${min} à ${max}`
  },
  dateOutOfRange: {
    en: (label: string, quoted: string, minYear: number, maxYear: number) =>
      `Left out the ${label} (${quoted}): it must be from ${minYear} to ${maxYear}`,
    fr: (label: string, quoted: string, minYear: number, maxYear: number) =>
      `${capital(label)} (${quoted}) : valeur ignorée, il faut une date de ${minYear} à ${maxYear}`
  },
  notADate: {
    en: (label: string, quoted: string) => `Left out the ${label} (${quoted}): it is not a date (YYYY-MM-DD)`,
    fr: (label: string, quoted: string) =>
      `${capital(label)} (${quoted}) : valeur ignorée, ce n'est pas une date (AAAA-MM-JJ)`
  },
  invalidPostalCode: {
    en: (quoted: string) => `Left out the postal code (${quoted}): it is not a valid postal code`,
    fr: (quoted: string) => `Code postal (${quoted}) : valeur ignorée, ce n'est pas un code postal valide`
  },
  lists: {
    skills: list(['skill', 'skills'], {
      shortened: ['compétence raccourcie', 'compétences raccourcies'],
      firstKept: (max) => `Seules les ${max} premières compétences ont été conservées`
    }),
    languages: list(['language', 'languages'], {
      shortened: ['langue raccourcie', 'langues raccourcies'],
      firstKept: (max) => `Seules les ${max} premières langues ont été conservées`
    }),
    benefits: list(['benefit', 'benefits'], {
      shortened: ['avantage raccourci', 'avantages raccourcis'],
      firstKept: (max) => `Seuls les ${max} premiers avantages ont été conservés`
    })
  },
  onlyFrance: {
    en: 'Only jobs in France are handled: check the location and the contract',
    fr: 'Seules les offres en France sont prises en charge : vérifiez le lieu et le contrat'
  },
  bothWorkingTimes: {
    en: 'Both hours per week and days per year were found: choose the working time arrangement',
    fr: 'Des heures par semaine et des jours par an ont été trouvés : choisissez le décompte du temps de travail'
  },
  payMinAboveMax: {
    en: 'The minimum pay is above the maximum: check the pay range',
    fr: 'La rémunération minimale dépasse la maximale : vérifiez la fourchette de rémunération'
  },
  /** `ratio`: portfolio-common's JOB_LIMITS.pay.maxRangeRatio */
  payRangeTooWide: {
    en: (ratio: number) =>
      `The maximum pay is more than ${ratio.toLocaleString('en-GB')} times the minimum: narrow the pay range`,
    fr: (ratio: number) =>
      `La rémunération maximale dépasse ${ratio.toLocaleString('fr-FR')} fois la minimale : resserrez la fourchette de rémunération`
  },
  /** `range`: an amount or two ("45", "40-45"); `period`: portfolio-common's PAY_PERIOD_LABELS ("per year") */
  checkPay: {
    en: (range: string, period: string) => `Check the pay: ${range} € ${period} looks too low (amounts in k€?)`,
    fr: (range: string, period: string) =>
      `Vérifiez la rémunération : ${range} € ${period} semble trop bas (montants en k€ ?)`
  },
  noJobDescription: {
    en: 'No job description was found in this file',
    fr: "Aucune offre d'emploi n'a été trouvée dans ce fichier"
  },
  /** `fields`: the fields above that POST /jobs requires, separated by commas */
  missing: {
    en: (fields: string) => `Not found in this file, needed to save the posting: ${fields}`,
    fr: (fields: string) => `Il manque dans ce fichier, pour enregistrer l'offre : ${fields}`
  }
})
