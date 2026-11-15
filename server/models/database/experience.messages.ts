import { defineMessages } from 'portfolio-common';

/** The rules of an experience the request schema cannot express (422, naming the field) */
export const m = defineMessages({
  titleRequired: { en: 'Title is required', fr: 'Indiquez un titre' },
  endBeforeStart: {
    en: 'End date must not be before the start date',
    fr: 'La date de fin ne peut pas précéder la date de début'
  },
  projectNameRequired: { en: 'Project name is required', fr: 'Indiquez le nom du projet' },
  projectEndBeforeStart: {
    en: 'Project end date must not be before its start date',
    fr: 'La date de fin du projet ne peut pas précéder sa date de début'
  }
});
