# Environnement jetable partagé par les scripts de CI : Mongo + fixture, API (IMAGE), front nginx.
# À sourcer : `. ci/env.sh` puis `ci_up`. Le nettoyage est automatique à la sortie.

IMAGE=${IMAGE:-coordfrontback-api:ci}
API_PORT=${API_PORT:-3000}
FRONT_PORT=${FRONT_PORT:-8080}
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
API="http://localhost:$API_PORT"

ci_down() {
  status=$?
  [ $status -ne 0 ] && docker logs ci-api 2>&1 | tail -30
  docker rm -f ci-mongo ci-api ci-front >/dev/null 2>&1 || true
  docker network rm ci-net >/dev/null 2>&1 || true
  exit $status
}

fail() { echo "✗ $1"; exit 1; }
ok() { echo "✓ $1"; }

ci_up() {
  trap ci_down EXIT
  docker network create ci-net >/dev/null
  docker run -d --name ci-mongo --network ci-net \
    --health-cmd "mongosh --quiet --eval 'db.adminCommand(\"ping\")'" --health-interval 2s mongo:8 >/dev/null
  until [ "$(docker inspect -f '{{.State.Health.Status}}' ci-mongo)" = healthy ]; do sleep 2; done
  docker run --rm --network ci-net -v "$ROOT/ci/seed.js:/seed.js:ro" mongo:8 \
    mongosh --quiet mongodb://ci-mongo:27017 /seed.js

  docker run -d --name ci-api --network ci-net -p "$API_PORT:3000" \
    -e MONGO_URI=mongodb://ci-mongo:27017 "$IMAGE" >/dev/null
  docker run -d --name ci-front -p "$FRONT_PORT:80" \
    -v "$ROOT/front:/usr/share/nginx/html:ro" nginx:alpine >/dev/null

  for i in $(seq 1 30); do
    curl -sf "$API/health" | grep -q UP && break
    [ "$i" = 30 ] && fail "API jamais prête"
    sleep 1
  done
  ok "health UP"
}

k6_run() {
  docker run --rm --network host --user "$(id -u):$(id -g)" -v "$ROOT/k6:/k6" -e BASE_URL="$API" "$@"
}
