#!/usr/bin/env bash
# Vérifie que deploy/rollback changent de version d'API sans perdre les données,
# et qu'un déploiement cassé revient tout seul à la version précédente.
# Usage : IMAGE=coordfrontback-api:ci API_PORT=3000 FRONT_PORT=8080 ci/rollback.sh
set -euo pipefail

IMAGE=${IMAGE:-coordfrontback-api:ci}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
export IMAGE_REPO=cfb-api COMPOSE_PROJECT_NAME=cfb-rollback-ci DEPLOY_DIR="$WORK/deploy" BACKUP_DIR="$WORK/backups"
export API_PORT=${API_PORT:-3000} FRONT_PORT=${FRONT_PORT:-8080}
# La base de test est toujours le Mongo jetable du projet compose, jamais celle du .env.
export MONGO_URI=mongodb://mongo:27017 MONGO_DB=sample_airbnb API_IMAGE=unused
API="http://localhost:$API_PORT"

cleanup() {
  status=$?
  docker compose -f "$ROOT/compose.yaml" -f "$ROOT/compose.prod.yaml" down -v >/dev/null 2>&1 || true
  docker rmi "$IMAGE_REPO:v1" "$IMAGE_REPO:v2" "$IMAGE_REPO:broken" >/dev/null 2>&1 || true
  rm -rf "$WORK"
  exit $status
}
trap cleanup EXIT
fail() { echo "✗ $1"; exit 1; }
ok() { echo "✓ $1"; }
running() { docker inspect -f '{{.Config.Image}}' "$COMPOSE_PROJECT_NAME-api-1"; }
name_of() { curl -sf "$API/listings/ci-rollback" | jq -r .name; }

docker tag "$IMAGE" "$IMAGE_REPO:v1"
docker tag "$IMAGE" "$IMAGE_REPO:v2"
printf 'FROM alpine:3\nCMD ["false"]\n' | docker build -q -t "$IMAGE_REPO:broken" - >/dev/null

cd "$WORK" # aucun .env du projet ne doit être chargé : scripts/ est appelé par chemin absolu
cp "$ROOT/compose.yaml" "$ROOT/compose.prod.yaml" "$WORK/"
mkdir -p "$WORK/scripts" && cp "$ROOT"/scripts/*.sh "$WORK/scripts/"
cp -r "$ROOT/front" "$ROOT/app" "$ROOT/nginx" "$WORK/"

"$WORK/scripts/deploy.sh" v1
curl -sf -X POST -H 'Content-Type: application/json' "$API/listings" \
  -d '{"_id":"ci-rollback","name":"Donnée à conserver"}' >/dev/null
ok "v1 déployée, donnée écrite"

"$WORK/scripts/deploy.sh" v2
[ "$(running)" = "$IMAGE_REPO:v2" ] || fail "v2 attendue, $(running) trouvée"
[ "$(name_of)" = "Donnée à conserver" ] || fail "donnée perdue après déploiement"
ok "v2 déployée, donnée conservée"

"$WORK/scripts/rollback.sh"
[ "$(running)" = "$IMAGE_REPO:v1" ] || fail "v1 attendue après rollback, $(running) trouvée"
[ "$(name_of)" = "Donnée à conserver" ] || fail "donnée perdue après rollback"
ok "rollback v2 → v1, donnée conservée"

if "$WORK/scripts/deploy.sh" broken; then fail "le déploiement cassé aurait dû échouer"; fi
[ "$(running)" = "$IMAGE_REPO:v1" ] || fail "retour automatique attendu sur v1, $(running) trouvée"
[ "$(name_of)" = "Donnée à conserver" ] || fail "donnée perdue après échec de déploiement"
ok "déploiement cassé → retour automatique à v1, donnée conservée"

[ "$(ls "$BACKUP_DIR" | wc -l)" -ge 4 ] || fail "une sauvegarde attendue par déploiement"
ok "$(ls "$BACKUP_DIR" | wc -l | tr -d ' ') sauvegardes mongodump créées"

curl -sf -X DELETE "$API/listings/ci-rollback" >/dev/null
[ "$(curl -s -o /dev/null -w '%{http_code}' "$API/listings/ci-rollback")" = 404 ] || fail "suppression"
"$WORK/scripts/restore.sh" "$(ls -1 "$BACKUP_DIR"/*avant-broken* | tail -n 1)" --yes
[ "$(name_of)" = "Donnée à conserver" ] || fail "restauration de la sauvegarde"
ok "sauvegarde restaurée : donnée supprimée récupérée"
