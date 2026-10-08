#!/usr/bin/env bash
# Lance l'image API (IMAGE) avec un Mongo jetable et une fixture, puis vérifie API, front et charge.
# Usage : IMAGE=coordfrontback-api:ci API_PORT=3000 FRONT_PORT=8080 ci/test.sh
set -euo pipefail

. "$(dirname "$0")/env.sh"
ci_up

# --- Contrat de lecture ---
page=$(curl -sf "$API/listings?limit=20")
[ "$(jq -r .total <<<"$page")" = 45 ] || fail "total attendu 45"
[ "$(jq -r .pages <<<"$page")" = 3 ] || fail "pages attendu 3"
[ "$(jq '.data | length' <<<"$page")" = 20 ] || fail "20 éléments attendus"
[ "$(jq -r '.data[0].price | type' <<<"$page")" = number ] || fail "price doit être un nombre"
ok "GET /listings (pagination, Decimal128 → nombre)"

[ "$(curl -sf "$API/listings?country=Spain" | jq -r '[.data[].address.country] | unique | join(",")')" = Spain ] \
  || fail "filtre country"
ok "GET /listings?country="

[ "$(curl -sf "$API/listings/ci-001" | jq -r .name)" = "Logement CI 1" ] || fail "détail ci-001"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$API/listings/inconnu")" = 404 ] || fail "404 attendu"
ok "GET /listings/:id (200 et 404)"

# --- Écritures (sur la base jetable uniquement) ---
code() { curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' "$@"; }
[ "$(code -X POST "$API/listings" -d '{"_id":"ci-new","name":"Créé en CI"}')" = 201 ] || fail "POST 201"
[ "$(code -X POST "$API/listings" -d '{"_id":"ci-new","name":"Doublon"}')" = 409 ] || fail "POST doublon 409"
[ "$(code -X POST "$API/listings" -d '{"summary":"sans nom"}')" = 400 ] || fail "POST sans name 400"
[ "$(curl -sf -X PATCH -H 'Content-Type: application/json' "$API/listings/ci-new" -d '{"beds":3}' | jq -r .beds)" = 3 ] \
  || fail "PATCH"
[ "$(code -X PUT "$API/listings/ci-new" -d '{"name":"Remplacé"}')" = 200 ] || fail "PUT 200"
[ "$(code -X DELETE "$API/listings/ci-new")" = 204 ] || fail "DELETE 204"
[ "$(code -X DELETE "$API/listings/ci-new")" = 404 ] || fail "DELETE 404"
ok "POST / PATCH / PUT / DELETE"

# --- Front ---
curl -sf "http://localhost:$FRONT_PORT/" | grep -q 'src="app.js"' || fail "index.html"
for f in app.js view.js; do
  curl -sfI "http://localhost:$FRONT_PORT/$f" | grep -qi 'content-type: application/javascript' || fail "$f MIME"
done
ok "front servi (HTML + modules JS)"

# --- Charge (smoke k6) ---
k6_run -e K6_WEB_DASHBOARD=true -e K6_WEB_DASHBOARD_EXPORT=/k6/rapport-ci.html \
  grafana/k6 run --quiet --vus 5 --duration 20s /k6/load.js
ok "k6 smoke"
