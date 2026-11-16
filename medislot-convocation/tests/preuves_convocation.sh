#!/usr/bin/env bash
# Preuves de l'étape 4 sur l'application qui tourne (docker compose up -d --build), à travers nginx.
# 200 pour le propriétaire (inline puis attachment), 404 pour l'autre patient, 409 après annulation, 401 sans session.
# Usage : tests/preuves_convocation.sh [URL]   (défaut http://localhost:8088)
set -euo pipefail
APP="${1:-http://localhost:8088}"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
PASSWORD='MediSlot-demo-2026!'

# Session + jeton CSRF (renouvelé après connexion, comme le front).
login() { # $1 = jarre à cookies, $2 = e-mail
  local jar="$1" token
  token=$(curl -sf -c "$jar" -b "$jar" "$APP/api/csrf" | sed -E 's/.*"token":"([^"]+)".*/\1/')
  curl -sf -o /dev/null -c "$jar" -b "$jar" -H "X-CSRF-TOKEN: $token" \
    --data-urlencode "username=$2" --data-urlencode "password=$PASSWORD" "$APP/api/login"
}
csrf() { curl -sf -c "$1" -b "$1" "$APP/api/csrf" | sed -E 's/.*"token":"([^"]+)".*/\1/'; }

P1="$WORK/patient.jar"; P2="$WORK/autre.jar"
login "$P1" patient@medislot.test
login "$P2" autre@medislot.test

# Un créneau libre du Dr Thomas Leroy (praticien 2), réservé par le premier patient.
SLOT=$(curl -sf "$APP/api/professionals/2/slots" | sed -E 's/^\[\{"id":([0-9]+).*/\1/')
ID=$(curl -sf -c "$P1" -b "$P1" -H "X-CSRF-TOKEN: $(csrf "$P1")" -H 'Content-Type: application/json' \
  -d "{\"slotId\":$SLOT}" "$APP/api/appointments" | sed -E 's/^\{"id":([0-9]+).*/\1/')
STARTS=$(curl -sf -b "$P1" "$APP/api/appointments/$ID" | sed -E 's/.*"startsAt":"([^"]+)".*/\1/')
echo "== Rendez-vous $ID réservé, créneau $SLOT, startsAt (UTC, API) = $STARTS"
echo "   Heure de Paris attendue sur le PDF : $(python3 -c "import sys;from datetime import datetime;from zoneinfo import ZoneInfo;print(datetime.fromisoformat(sys.argv[1].replace('Z','+00:00')).astimezone(ZoneInfo('Europe/Paris')).strftime('%-H h %M'))" "$STARTS")"
echo; echo "== 1. Propriétaire, affichage : curl -D - $APP/api/appointments/$ID/convocation.pdf"
curl -s -D - -o "$WORK/c.pdf" -b "$P1" "$APP/api/appointments/$ID/convocation.pdf" | tr -d '\r' \
  | grep -iE '^(HTTP|content-type|content-length|content-disposition|cache-control|x-content-type-options)'
echo "   Corps : $(head -c 8 "$WORK/c.pdf" | tr -d '\n') … $(wc -c < "$WORK/c.pdf" | tr -d ' ') octets"
if command -v pdftotext >/dev/null; then pdftotext "$WORK/c.pdf" - | grep -E 'h [0-9]{2}|Camille'; fi
cp "$WORK/c.pdf" "${OUT_PDF:-/dev/null}" 2>/dev/null || true

echo; echo "== 2. Propriétaire, enregistrement : ?download=true"
curl -s -D - -o /dev/null -b "$P1" "$APP/api/appointments/$ID/convocation.pdf?download=true" | tr -d '\r' \
  | grep -iE '^(HTTP|content-disposition)'

echo; echo "== 3. Second patient, même numéro"
curl -s -D - -b "$P2" -H 'Accept: application/pdf, application/problem+json' \
  "$APP/api/appointments/$ID/convocation.pdf" | tr -d '\r' | grep -iE '^(HTTP|content-type)|^\{'; echo

echo; echo "== 4. Sans session"
curl -s -D - "$APP/api/appointments/$ID/convocation.pdf" | tr -d '\r' | grep -iE '^(HTTP|content-type)|^\{'; echo

echo; echo "== 5. Après annulation par le propriétaire"
curl -sf -o /dev/null -c "$P1" -b "$P1" -X POST -H "X-CSRF-TOKEN: $(csrf "$P1")" "$APP/api/appointments/$ID/cancel"
curl -s -D - -b "$P1" -H 'Accept: application/pdf, application/problem+json' \
  "$APP/api/appointments/$ID/convocation.pdf" | tr -d '\r' | grep -iE '^(HTTP|content-type)|^\{'; echo
