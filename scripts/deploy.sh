#!/usr/bin/env bash
# Déploie une version de l'API sans toucher aux données.
#   1. sauvegarde la base (mongodump) dans backups/
#   2. remplace uniquement le conteneur api par l'image <tag>
#   3. si l'API n'est pas saine, revient automatiquement à la version précédente
# Usage : scripts/deploy.sh <tag>        (tag = SHA court publié par la CI, ex. 7f7a160)
set -euo pipefail

TAG=${1:?usage: scripts/deploy.sh <tag>}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
[ -f .env ] && set -a && . ./.env && set +a

IMAGE_REPO=${IMAGE_REPO:-ghcr.io/thomasfzr/coordfrontback-api}
DEPLOY_DIR=${DEPLOY_DIR:-$ROOT/.deploy}
BACKUP_DIR=${BACKUP_DIR:-$ROOT/backups}
MONGO_URI=${MONGO_URI:-mongodb://mongo:27017}
MONGO_DB=${MONGO_DB:-sample_airbnb}
export COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-$(basename "$ROOT" | tr '[:upper:]' '[:lower:]')}
HISTORY="$DEPLOY_DIR/history"
compose() { docker compose -f compose.yaml -f compose.prod.yaml "$@"; }

mkdir -p "$DEPLOY_DIR" "$BACKUP_DIR"
current=$(tail -n 1 "$HISTORY" 2>/dev/null || true)
image="$IMAGE_REPO:$TAG"

docker image inspect "$image" >/dev/null 2>&1 || docker pull "$image"

# La base doit tourner pour être sauvegardée (sans effet si elle tourne déjà).
API_IMAGE="$image" compose up -d --no-deps --wait mongo

backup="$BACKUP_DIR/$(date +%Y%m%d-%H%M%S)-avant-$TAG.archive.gz"
docker run --rm --network "${COMPOSE_PROJECT_NAME}_default" mongo:8 \
  mongodump --quiet --uri "$MONGO_URI" --db "$MONGO_DB" --archive --gzip > "$backup"
echo "✓ sauvegarde $backup ($(du -h "$backup" | cut -f1))"

if API_IMAGE="$image" compose up -d --no-deps --wait --wait-timeout 60 api; then
  API_IMAGE="$image" compose up -d --no-deps front
  echo "$TAG" >> "$HISTORY"
  echo "✓ $image déployée"
  exit 0
fi

echo "✗ $image n'est pas saine"
compose logs --tail 20 api || true
if [ -n "$current" ]; then
  API_IMAGE="$IMAGE_REPO:$current" compose up -d --no-deps --wait --wait-timeout 60 api
  echo "↩ retour automatique à $current"
fi
exit 1
