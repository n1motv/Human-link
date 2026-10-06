# ADR 0002 : Cookies httpOnly plutôt que des jetons stockés dans le navigateur

**Statut :** acceptée

## Contexte

L'application manipule des données personnelles (salaires, arrêts maladie, bulletins). Une session doit survivre à un rechargement de page sans qu'un script injecté puisse la voler.

## Décision

La session est portée par **deux cookies `httpOnly`, `SameSite=Strict`, `Secure` en production** : un jeton d'accès court (10 min) et un jeton de renouvellement (7 jours) qui **tourne à chaque usage**. Les requêtes qui modifient des données exigent aussi un en-tête CSRF (double-submit : cookie `hl_csrf` recopié dans `X-CSRF-Token`).

## Pourquoi

- Un jeton dans `localStorage` est lisible par n'importe quel script de la page : une seule faille XSS suffit à voler la session. Un cookie `httpOnly` est invisible du JavaScript.
- La rotation des jetons de renouvellement permet de détecter un vol : un jeton déjà utilisé qui revient ferme toute la famille de sessions.
- Chaque session est une famille de jetons : on peut lister les appareils connectés et en fermer un (page Sécurité).

## Conséquences

- Il faut une protection CSRF (fournie) et une origine unique : l'API et le front sont servis sous le même domaine (`CORS` limité à `APP_URL`).
- Pas d'application mobile native ni d'API publique tierce avec ce mécanisme ; si le besoin apparaît, il faudra des clés d'API séparées.
- En test local en HTTP, `COOKIE_SECURE=false` ; en production, HTTPS est obligatoire.

## Alternatives écartées

JWT en `localStorage` (vol par XSS) ; JWT en cookie sans rotation (une fuite reste valable jusqu'à expiration) ; sessions côté serveur uniquement (un état partagé à répliquer, sans gain ici).
