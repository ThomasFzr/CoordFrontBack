#!/usr/bin/env bash
# Baromètre de charge : cherche le débit où l'API ne tient plus ses seuils.
# Expose below=true (GITHUB_OUTPUT) si le dernier palier tenu est sous MIN_RPS ; ne fait pas échouer le job.
# Usage : IMAGE=coordfrontback-api:ci MIN_RPS=100 API_PORT=3000 FRONT_PORT=8080 ci/barometre.sh
set -euo pipefail

MIN_RPS=${MIN_RPS:-100}
# Conditions proches de la prod : 1 CPU, 256 Mo (compose.prod.yaml), volume de la vraie base.
export API_CPUS=${API_CPUS:-1} API_MEMORY=${API_MEMORY:-256m} SEED_COUNT=${SEED_COUNT:-5000}

. "$(dirname "$0")/env.sh"
ci_up

rm -f "$ROOT"/k6/barometre.{md,json,html}
set +e
k6_run -e OUT_DIR=/k6 -e K6_WEB_DASHBOARD=true -e K6_WEB_DASHBOARD_EXPORT=/k6/barometre.html \
  ${LEVELS:+-e LEVELS="$LEVELS"} ${STEP_SECONDS:+-e STEP_SECONDS="$STEP_SECONDS"} \
  grafana/k6 run --quiet /k6/barometre.js
code=$?
set -e
# 99 = seuils franchis : c'est le but du baromètre, pas une erreur du test.
[ $code -eq 0 ] || [ $code -eq 99 ] || fail "k6 a échoué (code $code)"

last_ok=$(jq -r '.lastOkRate // 0' "$ROOT/k6/barometre.json")
verdict=$(jq -r .verdict "$ROOT/k6/barometre.json")
{
  cat "$ROOT/k6/barometre.md"
  echo "Conditions : API limitée à $API_CPUS CPU et $API_MEMORY, $SEED_COUNT annonces avec avis. Objectif minimal : **$MIN_RPS req/s**."
} > "$ROOT/k6/barometre-summary.md"
[ -n "${GITHUB_STEP_SUMMARY:-}" ] && cat "$ROOT/k6/barometre-summary.md" >> "$GITHUB_STEP_SUMMARY"

below=false
[ "$last_ok" -lt "$MIN_RPS" ] && below=true
[ -n "${GITHUB_OUTPUT:-}" ] && printf 'last_ok=%s\nbelow=%s\n' "$last_ok" "$below" >> "$GITHUB_OUTPUT"

if [ "$below" = true ]; then
  echo "⚠ capacité $last_ok req/s < objectif $MIN_RPS req/s : une issue sera ouverte"
else
  ok "capacité $last_ok req/s ≥ objectif $MIN_RPS req/s"
fi
