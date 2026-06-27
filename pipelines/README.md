# Pipelines

The functional pipeline definitions live at the locations each platform expects:

| Platform | File | Purpose |
|---|---|---|
| GitHub Actions | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | Public portfolio CI: build + unit tests, then boot the stack and run the k6 **smoke** profile as a gating quality gate. |
| GitLab CI | [`.gitlab-ci.yml`](../.gitlab-ci.yml) | Same gate on GitLab (stages: validate → build → test → performance-smoke → report), using Docker-in-Docker. |

## Gate model

- **Gating (blocks merge):** build, unit tests, k6 **smoke** (SLO thresholds).
- **Non-gating (report only):** stress / spike / soak / degradation — these are
  scheduled or manual and publish artifacts without failing the pipeline, because
  they explore limits rather than assert a binary pass/fail. See
  [`../docs/performance-strategy.md`](../docs/performance-strategy.md).

## Artifacts produced

- `tests/k6/reports/smoke-summary.json` — machine-readable k6 summary.
- `k6-stack-logs.txt` — container logs for the run (post-mortem evidence).

## Roadmap (see main README §Roadmap)

Scheduled load/stress jobs, HTML reports, run-to-run comparison, and an
executive Markdown summary are intentionally left as next steps.
