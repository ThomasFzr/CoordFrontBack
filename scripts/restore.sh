#!/usr/bin/env bash
# Restaure une sauvegarde faite par deploy.sh. Remplace le contenu actuel de la base : à n'utiliser
# que si les données elles-mêmes doivent revenir en arrière (le rollback d'API ne le demande pas).
# Usage : scripts/restore.sh backups/<fichier>.archive.gz --yes
set -euo pipefail

ARCHIVE=${1:?usage: scripts/restore.sh <archive> --yes}
[ "${2:-}" = --yes ] || { echo "✗ la restauration écrase la base $ARCHIVE : relancer avec --yes"; exit 1; }
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
[ -f .env ] && set -a && . ./.env && set +a
export COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-$(basename "$ROOT" | tr '[:upper:]' '[:lower:]')}

docker run --rm -i --network "${COMPOSE_PROJECT_NAME}_default" mongo:8 \
  mongorestore --quiet --uri "${MONGO_URI:-mongodb://mongo:27017}" --drop --archive --gzip < "$ARCHIVE"
echo "✓ $ARCHIVE restaurée"
