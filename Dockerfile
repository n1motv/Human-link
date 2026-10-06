# Image de production : compile le front et le back, puis n'embarque que le nécessaire.
# Build : docker build -t human-link .                                   (client par défaut : clients/example)
#         docker build --build-arg CLIENT=acme -t human-link-acme .       (image embarquant clients/acme)
#
# L'image de base est figée par son empreinte (digest) : deux builds donnent les mêmes bases, et une image publiée
# ne peut pas être remplacée en douce. Dependabot propose chaque mise à jour (.github/dependabot.yml).
# À la main : docker buildx imagetools inspect node:22-slim, puis remplacer l'empreinte dans les FROM ci-dessous.
# Identifiant de version : empreinte des sources. Le front compilé et le serveur le portent tous les deux ; quand ils diffèrent
# (serveur mis à jour pendant qu'un onglet reste ouvert), le client propose de recharger (T-16).
FROM node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS build-id
WORKDIR /src
COPY shared shared
COPY server/src server/src
COPY server/package.json server/package-lock.json server/
COPY client/src client/src
COPY client/package.json client/package-lock.json client/
RUN find . -type f | sort | xargs sha256sum | sha256sum | cut -c1-12 > /build-id

# Ordre des couches : les dépendances (npm ci) d'abord, le code et l'identifiant de version ensuite. Ainsi une modification du code
# ne refait pas l'installation des paquets : le rechargement automatique des instances de test (npm run instances -- watch) reste rapide.
FROM node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
# Contrat de données partagé (types et schémas) : importé par le client (alias @shared) et copié dans le serveur à la compilation.
COPY shared /app/shared
COPY client ./
COPY --from=build-id /build-id /build-id
RUN VITE_BUILD_ID="$(cat /build-id)" npm run build

FROM node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS server-build
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY shared /app/shared
COPY server ./
RUN npm run build && npm prune --omit=dev

FROM node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
ARG CLIENT=example
LABEL org.opencontainers.image.title="Human Link" \
      org.opencontainers.image.description="Gestion RH — instance du client ${CLIENT}" \
      org.opencontainers.image.source="https://github.com/n1motv/Human-link"
ENV NODE_ENV=production \
    PORT=4000 \
    SERVE_CLIENT=true \
    CLIENT_DIST=/app/client/dist \
    CLIENT_DIR=/client \
    STORAGE_DIR=/data/storage \
    BUILD_ID_FILE=/app/build-id
WORKDIR /app/server
COPY --from=server-build /app/server/node_modules ./node_modules
COPY --from=server-build /app/server/dist ./dist
COPY --from=server-build /app/server/package.json ./
COPY --from=client-build /app/client/dist /app/client/dist
COPY --from=build-id /build-id /app/build-id
# Client embarqué (configuration, logos) : clients/<CLIENT>. En production on peut le remplacer en montant le dossier du client réel sur /client (voir docker-compose.yml).
COPY clients/${CLIENT} /client
# Processus non-root, seul /data est inscriptible.
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
