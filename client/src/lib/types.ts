// Les formes de données échangées avec l'API viennent du contrat partagé avec le serveur (shared/src/index.ts) :
// une divergence est détectée par les tests du serveur (server/tests/contract.test.ts), plus à l'exécution.
export type { Role, Decision, PublicConfig, User, UserRow, Brief, Leave, Sick, Bonus, Notif, VaultFile, CalendarEvent } from '@shared';
