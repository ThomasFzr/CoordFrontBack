#!/usr/bin/env bash
# Preuves de la recherche par position sur la pile lancée (docker compose -p medislot-geoloc up -d --build).
# Positions d'essai : places publiques, jamais une position réelle de personne.
set -euo pipefail
BASE="${APP_URL:-http://localhost:8088}"
PROJECT="${COMPOSE_PROJECT:-medislot-geoloc}"
fail() { echo "ÉCHEC : $*" >&2; exit 1; }

for _ in $(seq 1 60); do curl -sf "$BASE/api/professionals?size=1" >/dev/null && break; sleep 2; done
curl -sf "$BASE/api/professionals?size=1" >/dev/null || fail "$BASE ne répond pas (back démarré ? sinon : docker compose restart frontend)"

echo "1. Autour de la place Bellecour (45.7576, 4.8317), 5 km"
body=$(curl -sf "$BASE/api/professionals?lat=45.7576&lon=4.8317&radiusKm=5&size=50")
echo "$body" | python3 -c '
import sys, json
d = json.load(sys.stdin)
for i in d["items"]: print("   %4s km  %s" % (i["distanceKm"], i["name"]))
assert d["total"] == 6, d["total"]
assert [i["distanceKm"] for i in d["items"]] == sorted(i["distanceKm"] for i in d["items"])
assert "Dr Sophie Lambert" not in [i["name"] for i in d["items"]], "le coin de la boîte (Oullins) doit être écarté"
print("   -> 6 praticiens, triés, Oullins (5,2 km) écarté")'
grep -q "45.7576" <<<"$body" && fail "la réponse recopie la position reçue"

echo "2. Même centre, Cardiologie"
curl -sf "$BASE/api/professionals?lat=45.7576&lon=4.8317&specialty=cardiology" | python3 -c '
import sys, json
d = json.load(sys.stdin); print("  ", [(i["name"], i["distanceKm"]) for i in d["items"]]); assert d["total"] == 2'

echo "3. Refus en 400, en phrases"
check() {
  local q="$1" expected="$2" code detail
  code=$(curl -s -o /tmp/geoloc-body.$$ -w '%{http_code}' "$BASE/api/professionals?$q")
  detail=$(python3 -c 'import sys,json;print(json.load(open(sys.argv[1]))["detail"])' /tmp/geoloc-body.$$)
  rm -f /tmp/geoloc-body.$$
  [[ "$code" == 400 && "$detail" == "$expected" ]] || fail "$q -> $code $detail"
  printf '   %-30s 400  %s\n' "$q" "$detail"
}
check 'lat=95&lon=4.8' 'Latitude invalide : entre -90 et 90 degrés.'
check 'lat=45.75' 'Indiquez lat et lon ensemble.'
check 'lat=abc&lon=4.8' 'Paramètre invalide : lat.'
check 'lat=NaN&lon=4.8' 'Latitude invalide : entre -90 et 90 degrés.'
check 'lat=45.7&lon=4.8&radiusKm=30' 'Rayon invalide : plus de 0 et au plus 20 km.'

echo "4. Journal de nginx : chemin et statut, sans la chaîne de requête"
logs=$(docker compose -p "$PROJECT" logs --no-color frontend 2>&1 | grep '/api/professionals' | tail -4)
echo "$logs" | sed 's/^/   /'
grep -Eq 'lat=|lon=|45\.75' <<<"$(docker compose -p "$PROJECT" logs --no-color frontend 2>&1)" && fail "une position apparaît dans le journal nginx"
grep -Eq 'lat=|lon=|45\.7576' <<<"$(docker compose -p "$PROJECT" logs --no-color backend 2>&1)" && fail "une position apparaît dans le journal Spring"
echo "   -> aucune coordonnée dans les journaux de nginx et de Spring"
echo "Toutes les preuves sont vertes."
