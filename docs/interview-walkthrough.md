# Interview Walkthrough (5–7 minutes)

A tight narrative for presenting the project live. Each beat has a "show this".

## 0. One-sentence framing (15s)

> "It's a telco self-management API instrumented end-to-end, plus a k6
> performance suite and an observability stack, wired so that a CI quality gate
> can block a release on reliability — and so I can diagnose a degradation from
> symptom to root cause."

## 1. The system & the risks (45s)
**Show:** `docs/architecture.md` diagram.
Four journeys = four real telco risks. Payment is the riskiest (money +
concurrency), so it gets the most attention.

## 2. SLOs, not vibes (60s)
**Show:** `docs/slo-definition.md` table → `tests/k6/thresholds/thresholds.js`.
Per-journey p95 budgets derived from user impact, encoded verbatim as k6
thresholds. p95 not average — we care about the tail.

## 3. The right test for the right question (45s)
**Show:** `docs/performance-strategy.md` table.
Smoke/load gate the pipeline; stress/spike/soak are diagnostic and *non-gating*
— because a stress test that "fails" SLO has done its job.

## 4. Instrumentation (45s)
**Show:** `/metrics` output + a Tempo trace.
RED metrics via Prometheus, OTLP traces via the Collector to Tempo, structured
logs to Loki — every log line carries the `trace_id`.

## 5. The money demo: degradation drill (90s)
**Show:** run `degradation.js`, then Grafana.
- p95 on `/payments` climbs past budget; "Active faults" = 1.
- Open a slow trace in Tempo → time is in `payment-gateway-simulator`.
- Click "Logs for this span" → Loki shows the exact request by `trace_id`.
> "Metric told me *what*, the trace told me *where*, the log told me *why* —
> in three clicks."

## 6. Correctness under concurrency (45s)
**Show:** `docs/reliability-testing.md` + the idempotency check in `journeys.js`.
Idempotency is enforced by a Postgres `UNIQUE` constraint; k6 replays each
payment with the same key and asserts the same `paymentId`.

## 7. The gate (30s)
**Show:** `.github/workflows/ci.yml`.
PR builds the stack, runs smoke; a threshold breach fails the job. The value
isn't "tests run" — it's "this pipeline can stop a bad release."

## Closing line
> "The deliverable isn't load — it's *decisions*: defendable SLOs, the right
> test per risk, and observability good enough to debug under pressure."

---

### Likely questions & crisp answers

- **Why p95 not p99?** p95 is the standard SLO percentile and is stable enough
  to gate on; I still chart p99 for diagnosis.
- **Why is idempotency in the DB, not the app?** Under concurrency the app can't
  arbitrate a race; a `UNIQUE` constraint can. Redis is only a fast cache.
- **Why are stress/spike non-gating?** They explore limits; gating on them would
  punish the test for succeeding. They publish reports instead.
- **Open vs closed model?** Load uses arrival-rate (open) because real users
  don't throttle their arrival when the server is slow.
- **Cardinality?** Metric labels use templated routes, never raw URLs with ids.
