# Pipelines

The functional pipeline definitions live at the locations each platform expects:

| Platform | File | Purpose |
|---|---|---|
| GitHub Actions | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | PR/push CI: build + unit tests, OpenAPI spec lint, Playwright API tests, then boot the stack and run the k6 **smoke** profile as a gating quality gate (+ non-blocking OWASP ZAP scan). |
| GitHub Actions | [`.github/workflows/perf-scheduled.yml`](../.github/workflows/perf-scheduled.yml) | Nightly + manual: stress / spike / soak diagnostic profiles, run-to-run regression comparison, OWASP ZAP scan. Non-gating. |
| GitLab CI | [`.gitlab-ci.yml`](../.gitlab-ci.yml) | Mirror of the gate on GitLab (stages: validate → build → test → performance-smoke → security → performance-diagnostic → report), using Docker-in-Docker. |

## Gate model

- **Gating (blocks merge):** build, typecheck, unit tests, OpenAPI spec lint,
  Playwright API tests, k6 **smoke** (SLO thresholds).
- **Non-gating (report only):** stress / spike / soak / degradation and the OWASP
  ZAP passive scan — these are scheduled or manual and publish artifacts without
  failing the pipeline, because they explore limits / surface findings rather than
  assert a binary pass/fail. See
  [`../docs/performance-strategy.md`](../docs/performance-strategy.md).

## Artifacts produced

- `tests/k6/reports/*-summary.json` — machine-readable k6 summaries.
- `tests/k6/reports/*-report.html` — k6 web-dashboard HTML reports.
- `tests/k6/reports/comparison-*.md` — run-to-run regression comparison.
- `tests/api/reports/` — Playwright API test HTML report.
- `tests/zap/zap-report.html` — OWASP ZAP passive scan report.
- `k6-stack-logs.txt` — container logs for the run (post-mortem evidence).

## Related tooling

- `scripts/compare-runs.js` — run-to-run p95 / error-rate regression detector.
- `scripts/generate-report.js` — executive Markdown report (per-journey p95 vs SLO).
- `scripts/zap-smoke.sh` — OWASP ZAP baseline scan wrapper.
