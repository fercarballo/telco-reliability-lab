#!/usr/bin/env bash
#
# End-to-end verification of the Telco Reliability Lab stack.
#
# Usage:
#   scripts/verify-stack.sh            # verify an already-running stack
#   scripts/verify-stack.sh --up       # `docker compose up -d --build` first
#   scripts/verify-stack.sh --up --down  # also tear down at the end
#
# Exits non-zero if any check fails — safe to use as a CI smoke of the whole stack.
set -uo pipefail

API=${API:-http://localhost:3000}
PROM=${PROM:-http://localhost:9090}
TEMPO=${TEMPO:-http://localhost:3200}
LOKI=${LOKI:-http://localhost:3100}
GRAFANA=${GRAFANA:-http://localhost:3001}
WEB=${WEB:-http://localhost:8080}

DO_UP=0; DO_DOWN=0
for arg in "$@"; do
  case "$arg" in
    --up) DO_UP=1 ;;
    --down) DO_DOWN=1 ;;
    *) echo "unknown arg: $arg"; exit 2 ;;
  esac
done

pass=0; fail=0
green() { printf '\033[32m%s\033[0m\n' "$1"; }
red() { printf '\033[31m%s\033[0m\n' "$1"; }

# check <name> <command...> — command must exit 0 to pass.
check() {
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then green "  PASS  $name"; pass=$((pass+1));
  else red "  FAIL  $name"; fail=$((fail+1)); fi
}

# wait_for <url> — poll until 2xx/3xx or timeout (~120s).
wait_for() {
  local url="$1"
  for _ in $(seq 1 60); do
    if curl -fsS "$url" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}

if [ "$DO_UP" = 1 ]; then
  echo "==> docker compose up -d --build"
  docker compose up -d --build || { red "compose up failed"; exit 1; }
fi

echo "==> Waiting for core services to answer..."
wait_for "$API/health/live" || { red "API never came up"; docker compose ps; exit 1; }
wait_for "$PROM/-/ready"
wait_for "$GRAFANA/api/health"

echo "==> Component health"
# API readiness: database + redis must report ok.
check "API /health database+redis ok" bash -c "curl -fsS $API/health | grep -q '\"database\":\"ok\"' && curl -fsS $API/health | grep -q '\"redis\":\"ok\"'"
check "API /metrics exposes RED series" bash -c "curl -fsS $API/metrics | grep -q '^http_requests_total'"
check "Prometheus ready"  curl -fsS "$PROM/-/ready"
check "Tempo ready"       curl -fsS "$TEMPO/ready"
check "Loki ready"        curl -fsS "$LOKI/ready"
check "Grafana health"    curl -fsS "$GRAFANA/api/health"
check "Web UI serves"     curl -fsS "$WEB/"

echo "==> Generate a little traffic, then verify the pipeline"
# Drive one full journey so Prometheus has something to scrape and Loki has logs.
TOKEN=$(curl -fsS -X POST "$API/auth/login" -H 'content-type: application/json' \
  -d '{"username":"user_001","password":"password123"}' | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
check "Login returns a token" test -n "$TOKEN"
if [ -n "$TOKEN" ]; then
  curl -fsS "$API/customers/customer_001/invoices" -H "Authorization: Bearer $TOKEN" >/dev/null
fi

# Give Prometheus time for a scrape cycle (5s interval).
sleep 8
check "Prometheus scraped telco-api (up==1)" bash -c "curl -fsS '$PROM/api/v1/query?query=up%7Bjob%3D%22telco-api%22%7D' | grep -q '\"value\":\[[0-9.]*,\"1\"\]'"
check "Prometheus has request metrics" bash -c "curl -fsS '$PROM/api/v1/query?query=http_requests_total' | grep -q '\"telco-api\"'"
check "Grafana provisioned the RED dashboard" bash -c "curl -fsS '$GRAFANA/api/search?query=RED' | grep -q 'telco-api-red'"

echo "==> k6 smoke (SLO quality gate)"
if docker compose run --rm -T k6 run --summary-export /scripts/reports/smoke-summary.json /scripts/scenarios/smoke.js; then
  green "  PASS  k6 smoke within SLO thresholds"; pass=$((pass+1))
else
  red "  FAIL  k6 smoke breached thresholds (see output above)"; fail=$((fail+1))
fi

if [ "$DO_DOWN" = 1 ]; then
  echo "==> docker compose down -v"
  docker compose down -v
fi

echo
echo "==================== RESULT ===================="
echo "  passed: $pass    failed: $fail"
[ "$fail" -eq 0 ] && { green "  STACK VERIFIED ✓"; exit 0; } || { red "  VERIFICATION FAILED ✗"; exit 1; }
