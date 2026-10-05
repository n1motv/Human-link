# Image de sauvegarde : outils MongoDB (mongodump, mongorestore, mongosh) + openssl et curl.
FROM mongo:7
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl curl \
 && rm -rf /var/lib/apt/lists/*
COPY backup.sh restore-test.sh loop.sh selftest.sh /scripts/
RUN chmod +x /scripts/*.sh
ENTRYPOINT []
CMD ["/scripts/loop.sh"]
