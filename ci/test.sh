#!/usr/bin/env bash
# Lance l'image API (IMAGE) avec un Mongo jetable et une fixture, puis vérifie API, front et charge.
# Usage : IMAGE=coordfrontback-api:ci API_PORT=3000 FRONT_PORT=8080 ci/test.sh
set -euo pipefail

# Keepalive accéléré pour l'observer pendant le test (15 s en vrai).
export SSE_HEARTBEAT_MS=1000
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

# --- SSE, observé à travers nginx (même origine que le front) : prouve aussi l'absence de tampon ---
FRONT="http://localhost:$FRONT_PORT"
sse=$(mktemp)
curl -sN --max-time 7 "$FRONT/api/events" > "$sse" &
sse_pid=$!
sleep 1.5

# --- Écritures (sur la base jetable uniquement) ---
code() { curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' "$@"; }
[ "$(code -X POST "$API/listings" -d '{"_id":"ci-new","name":"Créé en CI"}')" = 201 ] || fail "POST 201"
[ "$(code -X POST "$API/listings" -d '{"_id":"ci-new","name":"Doublon"}')" = 409 ] || fail "POST doublon 409"
[ "$(code -X POST "$API/listings" -d '{"summary":"sans nom"}')" = 400 ] || fail "POST sans name 400"
[ "$(curl -sf -X PATCH -H 'Content-Type: application/json' "$API/listings/ci-new" -d '{"beds":3}' | jq -r .beds)" = 3 ] \
  || fail "PATCH"
[ "$(code -X PUT "$API/listings/ci-new" -d '{"name":"Remplacé"}')" = 200 ] || fail "PUT 200"
ok "POST / PATCH / PUT"

# --- Réservation conditionnelle (contrat du cours SSE) ---
reserve() { code -X POST "$API/listings/$1/reservations" -d "{\"customerId\":\"$2\"}"; }
[ "$(reserve ci-new client-a)" = 201 ] || fail "réservation 201"
[ "$(reserve ci-new client-b)" = 409 ] || fail "réservation déjà prise 409"
[ "$(reserve inconnu client-a)" = 404 ] || fail "réservation inconnue 404"
[ "$(code -X POST "$API/listings/ci-new/reservations" -d '{}')" = 400 ] || fail "réservation sans customerId 400"
detail=$(curl -sf "$API/listings/ci-new")
[ "$(jq -r .status <<<"$detail")" = BOOKED ] || fail "statut BOOKED"
[ "$(jq -r .version <<<"$detail")" = 4 ] || fail "version 4 (création, PATCH, PUT, réservation)"
[ "$(jq 'has("booking")' <<<"$detail")" = false ] || fail "la réservation (customerId) ne doit pas être publique"
release() { code -X DELETE "$API/listings/$1/reservations" -d "{\"customerId\":\"$2\"}"; }
[ "$(release ci-new client-b)" = 403 ] || fail "annulation par un autre client 403"
[ "$(code -X DELETE "$API/listings/ci-new/reservations" -d '{}')" = 400 ] || fail "annulation sans customerId 400"
[ "$(release ci-new client-a)" = 204 ] || fail "annulation par le titulaire 204"
[ "$(release ci-new client-a)" = 404 ] || fail "annulation sans réservation 404"
ok "réservation : 201, 409, 404, 400 ; annulation réservée au titulaire (403 sinon) ; customerId jamais exposé"

[ "$(code -X DELETE "$API/listings/ci-new")" = 204 ] || fail "DELETE 204"
[ "$(code -X DELETE "$API/listings/ci-new")" = 404 ] || fail "DELETE 404"
ok "DELETE"

wait $sse_pid || true
grep -q '^retry: 2000' "$sse" || fail "SSE : retry absent"
grep -A1 '^event: ready' "$sse" | grep -qx 'data: {"action":"reload"}' || fail "SSE : ready {action: reload} absent"
changes=$(grep -A1 '^event: listing-updated' "$sse" | sed -n 's/^data: //p' | jq -r '.change' | paste -sd, -)
[ "$changes" = "created,updated,updated,reserved,released,deleted" ] || fail "SSE : séquence inattendue ($changes)"
grep -A1 '^event: listing-updated' "$sse" | grep '^data:' | grep -q -v '"listingId":"ci-new"' && fail "SSE : listingId"
grep -q 'customerId\|client-a\|booking' "$sse" && fail "SSE : le flux ne doit pas contenir de donnée de réservation"
[ "$(grep -c '^id: ' "$sse")" = 6 ] || fail "SSE : un id par événement"
grep -q '^: keepalive' "$sse" || fail "SSE : keepalive absent"
ok "SSE via nginx : ready, 6 listing-updated ordonnés, ids, keepalive, aucune donnée privée"
rm -f "$sse"

# --- Champs protégés et concurrence optimiste (If-Match) ---
[ "$(code -X POST "$API/listings" -d '{"_id":"ci-cas","name":"Concurrence"}')" = 201 ] || fail "POST ci-cas"
for body in '{"status":"BOOKED"}' '{"booking.customerId":"pirate"}' '{"version":99}' '{"$where":"1"}'; do
  [ "$(code -X PATCH "$API/listings/ci-cas" -d "$body")" = 400 ] || fail "PATCH protégé refusé : $body"
done
[ "$(code -X POST "$API/listings" -d '{"_id":"ci-x","name":"x","status":"BOOKED"}')" = 400 ] || fail "POST avec status refusé"
[ "$(code -X PATCH -H 'If-Match: 7' "$API/listings/ci-cas" -d '{"beds":2}')" = 409 ] || fail "PATCH version périmée 409"
[ "$(code -X PATCH -H 'If-Match: 1' "$API/listings/ci-cas" -d '{"beds":2}')" = 200 ] || fail "PATCH bonne version 200"
[ "$(code -X PATCH -H 'If-Match: 1' "$API/listings/ci-cas" -d '{"beds":3}')" = 409 ] || fail "PATCH sur version déjà modifiée 409"
[ "$(code -X PUT -H 'If-Match: 1' "$API/listings/ci-cas" -d '{"name":"Remplacé"}')" = 409 ] || fail "PUT version périmée 409"
[ "$(code -X PATCH -H 'If-Match: none' "$API/listings/ci-001" -d '{"beds":2}')" = 200 ] || fail "PATCH document sans version (If-Match: none)"
[ "$(code -X DELETE -H 'If-Match: 1' "$API/listings/ci-cas")" = 409 ] || fail "DELETE version périmée 409"
[ "$(code -X DELETE -H 'If-Match: 2' "$API/listings/ci-cas")" = 204 ] || fail "DELETE bonne version 204"
ok "champs protégés (400) et concurrence optimiste If-Match (409 si l'annonce a changé)"

# --- Front ---
curl -sf "$FRONT/" | grep -q 'src="app.js"' || fail "index.html"
for f in app.js view.js; do
  curl -sfI "$FRONT/$f" | grep -qi 'content-type: application/javascript' || fail "$f MIME"
done
curl -sfI "$FRONT/app.js" | grep -qi 'cache-control: no-cache' || fail "front : Cache-Control no-cache"
curl -sf "$FRONT/api/health" | grep -q UP || fail "front : /api relayé vers l'API"
ok "front servi (HTML, modules JS, /api relayé)"

# --- Navigateur : deux onglets synchronisés par SSE (voir ci/e2e.mjs) ---
if [ -n "${CHROME:-}" ] || [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ] || command -v google-chrome >/dev/null; then
  node "$ROOT/ci/e2e.mjs" "$FRONT" || fail "test navigateur"
else
  echo "⚠ Chrome absent : test navigateur ignoré"
fi

# --- Charge (smoke k6) ---
k6_run -e K6_WEB_DASHBOARD=true -e K6_WEB_DASHBOARD_EXPORT=/k6/rapport-ci.html \
  grafana/k6 run --quiet --vus 5 --duration 20s /k6/load.js
ok "k6 smoke"
