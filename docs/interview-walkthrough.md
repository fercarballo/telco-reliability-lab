# Interview Walkthrough (7–10 minutes)

A tight narrative for presenting the project live. Each beat has a "show this".

## 0. One-sentence framing (20s)

> "It's a telco self-management API instrumented end-to-end — with functional
> API tests, a k6 performance suite, a full observability stack, SLO-triggered
> alerting, and CI gates that can stop a release on reliability."

## 1. The system & the risks (45s)
**Show:** `docs/architecture.md` diagram.
Four journeys = four real telco risks. Payment is the riskiest (money +
concurrency), so it gets the most attention across every testing tier.

## 2. SLOs, not vibes (60s)
**Show:** `docs/slo-definition.md` table → `tests/k6/thresholds/thresholds.js`.
Per-journey p95 budgets derived from user impact, encoded verbatim as k6
thresholds. p95 not average — we care about the tail. The OpenAPI spec at
`docs/openapi.yaml` is the formal contract that every test tier targets.

## 3. The right test for the right question (60s)
**Show:** `docs/performance-strategy.md` table.

Three distinct testing tiers:
- **Functional (Playwright)** — correctness: does the API honour its contract?
- **Performance (k6)** — reliability under load: do SLOs hold?
- **Security (OWASP ZAP)** — passive baseline: no obvious vulnerabilities?

Smoke/load gate the pipeline; stress/spike/soak are diagnostic and *non-gating*
because a stress test that "fails" SLO has done its job.

## 4. Functional layer: Playwright API tests (45s)
**Show:** `tests/api/payments.spec.ts` — the idempotency test.

```
⭐ idempotent replay: same Idempotency-Key → 200 with identical paymentId
```

This test sends the same `POST /payments` twice with the same `Idempotency-Key`
and asserts the `paymentId` is identical — proving no retry can double-charge a
customer. It's enforced at the DB layer (`UNIQUE` constraint) so it holds under
concurrency, not just sequential retries.

21 tests across 5 spec files: auth guards, schema validation, 403 cross-customer
access, and the idempotency invariant. All run against the real stack — no mocks.

## 5. Instrumentation (45s)
**Show:** `/metrics` output + a Tempo trace.
RED metrics via Prometheus, OTLP traces via the Collector to Tempo, structured
logs to Loki — every log line carries the `trace_id`.

## 6. The money demo: degradation drill (90s)
**Show:** run `make degradation`, then Grafana.
- Payment p95 climbs past the 1500 ms SLO budget; "Active faults" = 1.
- Open a slow trace in Tempo → the time is in `payment-gateway-simulator`.
- Click "Logs for this span" → Loki shows the exact request by `trace_id`.
> "Metric told me *what*, the trace told me *where*, the log told me *why* —
> in three clicks."

## 7. The alert fires (30s)
**Show:** Prometheus → Alertmanager UI (http://localhost:9093) during the fault.
`PaymentP95SLOBreach` alert transitions to **firing** after 1 minute.
Alertmanager routes the webhook to `POST /admin/alerts` on the API itself, which
logs it via pino → Loki. The full chain: metric breach → Prometheus rule → 
Alertmanager → webhook → structured log — visible in Grafana Explore.

> "In production this webhook points to PagerDuty. In the lab it closes the
> loop locally — no external dependencies."

## 8. Correctness under concurrency (30s)
**Show:** `docs/reliability-testing.md`.
Idempotency is enforced by a Postgres `UNIQUE` constraint, not the application.
Under concurrency the app can't arbitrate a race; a DB constraint can. Redis is
only a fast-path cache for warm replays.

## 9. The quality gate (45s)
**Show:** `.github/workflows/ci.yml`.
Four jobs run after every push:
1. **build-test** — typecheck + unit tests + build
2. **spec-lint** — OpenAPI contract must be valid
3. **api-integration** — 21 Playwright tests (idempotency invariant)
4. **performance-smoke** — k6 smoke: SLO thresholds must pass

A threshold breach on any of them fails the PR. Scheduled nightly: stress +
spike + run-to-run regression comparison + OWASP ZAP passive scan.

## Closing line
> "The deliverable isn't load — it's *decisions*: a formal API contract,
> per-journey SLO thresholds, the right test for each risk, alerting so you'd
> know before a customer calls, and observability good enough to debug under
> pressure."

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
- **Why Playwright for API tests?** `APIRequestContext` tests real HTTP behaviour
  (headers, JWT, status codes) against the live stack — no mocks, no false
  confidence. The idempotency test is the most important: it would have caught
  the payment drain bug we found in session 4.
- **Why ZAP baseline and not active?** The baseline (passive) scan is
  non-blocking CI hygiene — it finds obvious misconfigurations without risk of
  damaging data. Active fuzzing belongs in a dedicated security environment.
- **Why Alertmanager webhook to the API itself?** In the lab it closes the
  observability loop — alerts are visible in Loki alongside traces — without
  requiring Slack/PagerDuty credentials in CI. In production you'd replace the
  webhook URL.
- **Run-to-run regression?** `scripts/compare-runs.js` compares two
  `--summary-export` JSONs; exits 1 on ≥ 25% p95 regression so CI catches
  gradual degradation across releases, not just absolute SLO breach.
