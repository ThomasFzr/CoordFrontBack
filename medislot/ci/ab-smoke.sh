#!/usr/bin/env bash
# Vérifie le test A/B au niveau HTTP (étapes 2, 4, 5 et 7 du TP), à travers Nginx comme le navigateur.
# Usage : ci/ab-smoke.sh [URL]            expérience active (par défaut http://localhost:8088)
#         ci/ab-smoke.sh [URL] --disabled  après AB_ENABLED=false : A pour tous, rien n'est enregistré
set -euo pipefail
BASE=${1:-http://localhost:8088}
MODE=${2:-}
API="$BASE/api"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
fail() { echo "✗ $1"; [ -n "${GITHUB_ACTIONS:-}" ] && echo "::error title=ab-smoke::$1"; exit 1; }
ok() { echo "✓ $1"; }
metric() { curl -sf "$API/ab/metrics" | jq -r --arg v "$1" ".variants[] | select(.variant==\$v) | .$2"; }

if [ "$MODE" = --disabled ]; then
  body=$(curl -sf -D "$WORK/h" "$API/ab/assignment")
  [ "$(jq -r .enabled <<<"$body")" = false ] && [ "$(jq -r .variant <<<"$body")" = A ] || fail "expérience arrêtée : A attendu"
  grep -qi '^set-cookie: ab_visitor' "$WORK/h" && fail "expérience arrêtée : aucun cookie ne doit être posé"
  before=$(curl -sf "$API/ab/metrics" | jq -c '[.variants[] | {assigned,exposed,converted}]')
  [ "$(curl -s -o /dev/null -w '%{http_code}' -X POST -b 'ab_visitor=00000000-0000-4000-8000-000000000000' "$API/ab/exposure")" = 204 ] || fail "exposure 204"
  [ "$(curl -sf "$API/ab/metrics" | jq -c '[.variants[] | {assigned,exposed,converted}]')" = "$before" ] || fail "expérience arrêtée : les chiffres ne doivent pas bouger"
  [ "$(curl -sf "$API/ab/metrics" | jq -r .enabled)" = false ] || fail "metrics.enabled=false"
  ok "expérience arrêtée : A sans cookie, aucune nouvelle mesure, données précédentes consultables"
  exit 0
fi

# --- Affectation stable (étape 2) ---
jar="$WORK/visitor.txt"
first=$(curl -sf -c "$jar" -b "$jar" -D "$WORK/h1" "$API/ab/assignment")
grep -qi '^cache-control: no-store' "$WORK/h1" || fail "assignment : Cache-Control no-store"
cookie=$(grep -i '^set-cookie: ab_visitor=' "$WORK/h1" | tr -d '\r') || fail "assignment : cookie ab_visitor posé"
for attr in HttpOnly 'SameSite=Lax' 'Max-Age=33696000' 'Path=/'; do grep -qi "$attr" <<<"$cookie" || fail "cookie : $attr"; done
variant=$(jq -r .variant <<<"$first"); bucket=$(jq -r .bucket <<<"$first")
{ [ "$bucket" -lt 128 ] && [ "$variant" = A ]; } || { [ "$bucket" -ge 128 ] && [ "$variant" = B ]; } || fail "seau $bucket incohérent avec $variant"
for i in 1 2 3; do
  again=$(curl -sf -c "$jar" -b "$jar" -D "$WORK/h2" "$API/ab/assignment")
  [ "$(jq -c '{variant,bucket}' <<<"$again")" = "$(jq -c '{variant,bucket}' <<<"$first")" ] || fail "rechargement $i : version changée"
  grep -qi '^set-cookie: ab_visitor' "$WORK/h2" && fail "rechargement $i : cookie reposé (il ne doit jamais être prolongé)"
done
ok "affectation $variant (seau $bucket) stable sur 3 rechargements, cookie posé une seule fois, no-store"

# --- Exposition unique (étape 4) ---
assigned=$(metric "$variant" assigned); exposed=$(metric "$variant" exposed)
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/ab/exposure")" = 400 ] || fail "exposure sans cookie : 400"
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST -b 'ab_visitor=pas-un-uuid' "$API/ab/exposure")" = 400 ] || fail "exposure avec identifiant invalide : 400"
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST -b 'ab_visitor=00000000-0000-4000-8000-000000000000' "$API/ab/exposure")" = 404 ] || fail "exposure sans affectation : 404"
for i in 1 2; do [ "$(curl -s -o /dev/null -w '%{http_code}' -b "$jar" -X POST "$API/ab/exposure")" = 204 ] || fail "exposure $i : 204"; done
[ "$(metric "$variant" exposed)" = $((exposed + 1)) ] || fail "deux déclarations : une seule exposition attendue"
[ "$(metric "$variant" assigned)" = "$assigned" ] || fail "aucun nouveau visiteur ne doit être compté"
ok "exposition : 204 répétable, comptée une seule fois ; 400 sans identité, 404 sans affectation"

# --- Conversion (étape 5) : session patient + CSRF, comme le front ---
csrf() { curl -sf -c "$jar" -b "$jar" "$API/csrf"; }
t=$(csrf); h=$(jq -r .headerName <<<"$t"); v=$(jq -r .token <<<"$t")
[ "$(curl -s -o /dev/null -w '%{http_code}' -c "$jar" -b "$jar" -H "$h: $v" --data-urlencode 'username=autre@medislot.test' --data-urlencode 'password=MediSlot-demo-2026!' "$API/login")" = 204 ] || fail "connexion"
t=$(csrf); h=$(jq -r .headerName <<<"$t"); v=$(jq -r .token <<<"$t")
slots=$(curl -sf "$API/professionals/6/slots")
book() { curl -s -o /dev/null -w '%{http_code}' -c "$jar" -b "$jar" -H "$h: $v" -H 'Content-Type: application/json' "${@:2}" -d "{\"slotId\":$1}" "$API/appointments"; }
converted=$(metric "$variant" converted); bookings=$(metric "$variant" bookings)
s1=$(jq -r '.[0].id' <<<"$slots"); s2=$(jq -r '.[1].id' <<<"$slots"); s3=$(jq -r '.[2].id' <<<"$slots")
[ "$(book "$s1" -H 'X-AB-Measure: 1')" = 201 ] || fail "réservation 201"
[ "$(metric "$variant" converted)" = $((converted + 1)) ] || fail "converted +1 après la première réservation"
[ "$(book "$s2" -H 'X-AB-Measure: 1')" = 201 ] || fail "seconde réservation 201"
[ "$(metric "$variant" converted)" = $((converted + 1)) ] || fail "même visiteur : toujours un seul converti"
[ "$(metric "$variant" bookings)" = $((bookings + 2)) ] || fail "deux réservations attribuées"
[ "$(book "$s1" -H 'X-AB-Measure: 1')" = 409 ] || fail "créneau déjà pris : 409"
[ "$(metric "$variant" bookings)" = $((bookings + 2)) ] || fail "un 409 ne laisse aucune conversion"
[ "$(book "$s3")" = 201 ] || fail "réservation sans mesure (mode de secours) 201"
[ "$(metric "$variant" bookings)" = $((bookings + 2)) ] || fail "sans X-AB-Measure : réservation non attribuée"
ok "conversion : +1 converti pour 2 réservations, 409 et mode de secours non attribués"

m=$(curl -sf "$API/ab/metrics")
jq -e '.variants | length == 2' <<<"$m" >/dev/null || fail "metrics : variantes A et B"
jq -e 'all(.variants[]; (.exposed == 0 and .rate == null) or (.exposed > 0 and (.rate - (.converted / .exposed) | fabs) < 1e-9))' <<<"$m" >/dev/null || fail "rate = converted / exposed, null sans exposé"
jq -e '.srm | has("chi2") and has("pValue") and has("alert")' <<<"$m" >/dev/null || fail "metrics : contrôle SRM"
ok "metrics : taux null sans exposé, contrôle de répartition (SRM) fourni"
