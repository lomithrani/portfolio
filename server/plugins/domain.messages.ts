import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
  notDomainAdmin: {
    en: 'Forbidden: not the domain admin',
    fr: "Accès refusé : vous n'êtes pas le propriétaire de ce portfolio"
  },
  invalidDomainName: { en: 'Invalid domain name', fr: 'Adresse de portfolio invalide' },
  domainAlreadyExists: { en: 'Domain already exists', fr: 'Cette adresse est déjà prise' }
});
