#!/usr/bin/env bash
# Baromètre de charge : augmente le débit petit à petit (+STEP_RPS req/s par palier) jusqu'à la rupture.
# Un palier est tenu si p95 < SLO_P95 ms, erreurs < SLO_ERRORS et débit servi ≥ 90 % du palier.
# Le premier palier qui casse est rejoué une fois pour écarter un faux positif, puis le test s'arrête.
# Expose below=true (GITHUB_OUTPUT) si le dernier palier tenu est sous MIN_RPS ; ne fait pas échouer le job.
# Usage : IMAGE=coordfrontback-api:ci MIN_RPS=300 ci/barometre.sh
set -euo pipefail

MIN_RPS=${MIN_RPS:-300}
START_RPS=${START_RPS:-50}
STEP_RPS=${STEP_RPS:-50}
MAX_RPS=${MAX_RPS:-5000}
DURATION=${DURATION:-10}
SLO_P95=${SLO_P95:-500}
SLO_ERRORS=${SLO_ERRORS:-0.01}
# Conditions proches de la prod : 1 CPU, 256 Mo (compose.prod.yaml), volume de la vraie base.
export API_CPUS=${API_CPUS:-1} API_MEMORY=${API_MEMORY:-256m} SEED_COUNT=${SEED_COUNT:-5000}

. "$(dirname "$0")/env.sh"
ci_up

OUT="$ROOT/k6"
rm -f "$OUT"/barometre*.{md,json,jsonl} "$OUT/palier.json"

palier() {
  k6_run -e RATE="$1" -e DURATION="$DURATION" -e OUT=/k6/palier.json grafana/k6 run --quiet /k6/barometre.js >/dev/null
  jq -c --argjson p95 "$SLO_P95" --argjson err "$SLO_ERRORS" \
    '. + {ok: (.p95 != null and .p95 < $p95 and .errors < $err and .served >= .rate * 0.9)}' "$OUT/palier.json"
}

line() {
  jq -r '"\(.rate|tostring|.[0:5]) req/s \(if .ok then "✓" else "✗" end)  servi \(.served|floor)  p95 \((.p95 // 0)|floor) ms  erreurs \(.errors*10000|floor/100) %"' <<<"$1"
}

last_ok=0
breaking=null
rate=$START_RPS
while [ "$rate" -le "$MAX_RPS" ]; do
  row=$(palier "$rate")
  if [ "$(jq -r .ok <<<"$row")" != true ]; then
    echo "  $(line "$row") → confirmation"
    row=$(palier "$rate")
  fi
  echo "$row" >> "$OUT/barometre.jsonl"
  echo "  $(line "$row")"
  if [ "$(jq -r .ok <<<"$row")" != true ]; then
    breaking=$rate
    break
  fi
  last_ok=$rate
  rate=$((rate + STEP_RPS))
done

if [ "$breaking" = null ]; then
  verdict="Aucune rupture jusqu'à $MAX_RPS req/s."
else
  verdict="Rupture à $breaking req/s. Dernier palier tenu : $last_ok req/s."
fi

jq -s --arg verdict "$verdict" --argjson last "$last_ok" --argjson brk "$breaking" \
  --argjson step "$STEP_RPS" --argjson dur "$DURATION" --argjson p95 "$SLO_P95" --argjson err "$SLO_ERRORS" \
  '{verdict: $verdict, lastOkRate: $last, breakingRate: $brk, stepRps: $step, stepSeconds: $dur,
    slo: {p95: $p95, errorRate: $err, served: 0.9}, steps: .}' "$OUT/barometre.jsonl" > "$OUT/barometre.json"

{
  echo "## Baromètre de charge k6"
  echo
  echo "Montée de $STEP_RPS req/s par palier de $DURATION s, à partir de $START_RPS req/s, jusqu'à la rupture."
  echo "Un palier est tenu si p95 < $SLO_P95 ms, erreurs < $(jq -n "$SLO_ERRORS * 100") % et débit servi ≥ 90 % du palier."
  echo
  echo "**$verdict**"
  echo
  echo "| Palier (req/s) | Servi (req/s) | p95 (ms) | Erreurs | Verdict |"
  echo "|---:|---:|---:|---:|:---:|"
  jq -r '"| \(.rate) | \(.served|floor) | \((.p95 // 0)|floor) | \(.errors*10000|floor/100) % | \(if .ok then "✅" else "❌" end) |"' \
    "$OUT/barometre.jsonl"
  echo
  echo "Conditions : API limitée à $API_CPUS CPU et $API_MEMORY, $SEED_COUNT annonces avec avis. Objectif minimal : **$MIN_RPS req/s**."
} > "$OUT/barometre-summary.md"
cp "$OUT/barometre-summary.md" "$OUT/barometre.md"
echo
echo "$verdict"

[ -n "${GITHUB_STEP_SUMMARY:-}" ] && cat "$OUT/barometre-summary.md" >> "$GITHUB_STEP_SUMMARY"

below=false
[ "$last_ok" -lt "$MIN_RPS" ] && below=true
[ -n "${GITHUB_OUTPUT:-}" ] && printf 'last_ok=%s\nbelow=%s\n' "$last_ok" "$below" >> "$GITHUB_OUTPUT"

if [ "$below" = true ]; then
  echo "⚠ capacité $last_ok req/s < objectif $MIN_RPS req/s : une issue sera ouverte"
else
  ok "capacité $last_ok req/s ≥ objectif $MIN_RPS req/s"
fi
