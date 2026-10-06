# Image de sauvegarde : outils MongoDB (mongodump, mongorestore, mongosh) + openssl et curl.
FROM mongo:7@sha256:1f995ad6fdb93244a1addab1b58f934a0bc2f5643c38e02f5e9d7f0c7d227a7b
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl curl \
 && rm -rf /var/lib/apt/lists/*
COPY backup.sh restore-test.sh loop.sh selftest.sh /scripts/
# Fins de ligne Unix quoi qu'il arrive : un dépôt extrait sous Windows peut les avoir converties en CRLF, et « set -eu » suivi d'un retour chariot ferait échouer les scripts.
RUN sed -i 's/\r$//' /scripts/*.sh && chmod +x /scripts/*.sh
ENTRYPOINT []
CMD ["/scripts/loop.sh"]
