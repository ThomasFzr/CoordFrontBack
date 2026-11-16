#!/usr/bin/env bash
# Vérifie, sur la pile démarrée (docker compose up -d --build), que la trace passe de bout en bout.
#   1. Jaeger répond et connaît le service medislot-api.
#   2. Une requête portant un traceparent donné produit, dans CETTE trace, le span serveur du back et ses spans SQL.
#   3. La route Nginx /otlp/ mène au collecteur : un span « medislot-web » envoyé par là rejoint la même trace.
# Aucun outil en plus de curl et grep. Sous Windows : Git Bash.
set -u
APP=${APP_URL:-http://localhost:8088}
JAEGER=${JAEGER_URL:-http://localhost:16686}
OK=0; KO=0
ok()  { echo "OK     $1"; OK=$((OK+1)); }
ko()  { echo "ÉCHEC  $1"; KO=$((KO+1)); }
hex() { LC_ALL=C tr -dc 'a-f0-9' </dev/urandom | head -c "$1"; }

TRACE=$(hex 32); PARENT=$(hex 16)
TRACEPARENT="00-${TRACE}-${PARENT}-01"

# Attend qu'une condition sur la trace devienne vraie (export par lots : quelques secondes).
trace_contient() {
  local motif=$1 i
  for i in $(seq 1 20); do
    if curl -fsS "$JAEGER/api/traces/$TRACE" 2>/dev/null | grep -q "$motif"; then return 0; fi
    sleep 1
  done
  return 1
}

# 1 · Jaeger et le service du back (Jaeger 2 : /api/v3/services ; l'ancien /api/services répond 404)
curl -fsS -o /dev/null -H "traceparent: $TRACEPARENT" "$APP/api/professionals?page=0&size=5" \
  || echo "       (l'appel à $APP/api/professionals a échoué : la pile est-elle démarrée ?)"
services=""
for i in $(seq 1 20); do
  services=$(curl -fsS "$JAEGER/api/v3/services" 2>/dev/null) && echo "$services" | grep -q '"medislot-api"' && break
  sleep 1
done
if echo "$services" | grep -q '"medislot-api"'; then ok "1. Jaeger connaît le service medislot-api"
else ko "1. Jaeger ne propose pas medislot-api (agent chargé ? OTEL_SERVICE_NAME ? exporters du pipeline ?)"; fi

# 2 · le back rejoint la trace reçue et trace le SQL
if trace_contient '"serviceName":"medislot-api"' && trace_contient '"key":"db\.\(statement\|query\.text\)"' \
   && trace_contient "\"spanID\":\"$PARENT\""; then
  ok "2. Trace $TRACE : span serveur du back, enfant du traceparent reçu, avec ses requêtes SQL"
else
  ko "2. Trace $TRACE absente ou incomplète dans Jaeger (traceparent ignoré ? spans SQL manquants ?)"
fi

# 3 · Nginx /otlp/ -> collecteur -> Jaeger, dans la même trace
NOW=$(date +%s)000000000
SPAN=$(hex 16)
CORPS='{"resourceSpans":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"medislot-web"}}]},"scopeSpans":[{"scope":{"name":"verifier_traces"},"spans":[{"traceId":"'$TRACE'","spanId":"'$PARENT'","name":"GET","kind":3,"startTimeUnixNano":"'$NOW'","endTimeUnixNano":"'$NOW'"}]}]}]}'
code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data "$CORPS" "$APP/otlp/v1/traces")
if [ "$code" = "200" ] && trace_contient '"serviceName":"medislot-web"'; then
  ok "3. /otlp/ relaie vers le collecteur : medislot-web et medislot-api partagent la trace $TRACE"
else
  ko "3. /otlp/v1/traces a répondu $code, ou le span medislot-web n'est pas arrivé (location /otlp/ ? barre finale de proxy_pass ?)"
fi
: "$SPAN"

echo "Bilan : $OK OK, $KO ÉCHEC"
[ "$KO" -eq 0 ]
