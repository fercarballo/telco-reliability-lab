#!/usr/bin/env bash
# OWASP ZAP baseline scan — passive security smoke test.
# Runs zap-baseline.py (no active fuzzing) against the API and generates an
# HTML report. Non-blocking: exits 0 even on ZAP warnings so CI stays green;
# only hard errors (exit 2) cause a non-zero exit.
#
# Usage (local):  ./scripts/zap-smoke.sh
# Usage (CI):     ./scripts/zap-smoke.sh --network <compose-network> --target http://api:3000
set -euo pipefail

ZAP_IMAGE="ghcr.io/zaproxy/zaproxy:stable"
TARGET="${TARGET:-http://localhost:3000}"
NETWORK="${NETWORK:-}"
REPORT_DIR="$(cd "$(dirname "$0")/.." && pwd)/tests/zap"
REPORT_HTML="$REPORT_DIR/zap-report.html"
REPORT_JSON="$REPORT_DIR/zap-report.json"

mkdir -p "$REPORT_DIR"

# Parse optional args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --network) NETWORK="$2"; shift 2 ;;
    --target)  TARGET="$2";  shift 2 ;;
    *) shift ;;
  esac
done

DOCKER_ARGS=(--rm -v "$REPORT_DIR:/zap/wrk/:rw")
[[ -n "$NETWORK" ]] && DOCKER_ARGS+=(--network "$NETWORK")

echo "=== OWASP ZAP baseline scan ==="
echo "Target  : $TARGET"
echo "Network : ${NETWORK:-host}"
echo "Report  : $REPORT_HTML"
echo ""

# zap-baseline.py exit codes:
#   0 = no alerts
#   1 = warnings only  (-I ignores these → we treat as 0)
#   2 = errors found
#   3 = scan failed to run
set +e
docker run "${DOCKER_ARGS[@]}" "$ZAP_IMAGE" \
  zap-baseline.py \
  -t "$TARGET" \
  -r /zap/wrk/zap-report.html \
  -J /zap/wrk/zap-report.json \
  -I \
  -l WARN \
  2>&1
ZAP_EXIT=$?
set -e

echo ""
if [[ $ZAP_EXIT -eq 0 || $ZAP_EXIT -eq 1 ]]; then
  echo "ZAP baseline PASS (exit $ZAP_EXIT — warnings are non-blocking)"
  echo "Report: $REPORT_HTML"
  exit 0
elif [[ $ZAP_EXIT -eq 2 ]]; then
  echo "ZAP baseline FAIL (exit 2 — hard errors found; see $REPORT_HTML)"
  exit 2
else
  echo "ZAP scan could not complete (exit $ZAP_EXIT)"
  exit $ZAP_EXIT
fi
