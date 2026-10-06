/**
 * Identifiant du build de ce front : empreinte des sources, posée par la construction de l'image Docker (Dockerfile → VITE_BUILD_ID).
 * Le serveur l'annonce aussi dans GET /api/health ; s'ils diffèrent, l'onglet tourne sur une ancienne version. « dev » hors Docker.
 */
export const CLIENT_BUILD: string = import.meta.env.VITE_BUILD_ID ?? 'dev';
