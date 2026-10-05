# Image de production : compile le front et le back, puis n'embarque que le nécessaire.
# Build : docker build -t human-link .

FROM node:22-slim AS client-build
# Contrat de données partagé (types et schémas) : importé par le client (alias @shared) et copié dans le serveur à la compilation.
COPY shared /app/shared
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client ./
RUN npm run build

FROM node:22-slim AS server-build
COPY shared /app/shared
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server ./
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production \
    PORT=4000 \
    SERVE_CLIENT=true \
    CLIENT_DIST=/app/client/dist \
    CLIENT_DIR=/client \
    STORAGE_DIR=/data/storage
WORKDIR /app/server
COPY --from=server-build /app/server/node_modules ./node_modules
COPY --from=server-build /app/server/dist ./dist
COPY --from=server-build /app/server/package.json ./
COPY --from=client-build /app/client/dist /app/client/dist
# Client par défaut ; en production on monte le dossier du client réel sur /client (voir docker-compose.yml).
COPY clients/example /client
# Processus non-root, seul /data est inscriptible.
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
