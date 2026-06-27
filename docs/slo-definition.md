# SLOs, SLIs & Thresholds

SLOs here are **defendable**, not decorative. Each one ties to a user-visible
risk and maps directly to a k6 threshold and a Grafana panel.

## SLIs (what we measure)

- **Availability (synthetic):** share of journey requests that succeed
  (`http_req_failed`).
- **Latency:** `http_req_duration` per journey, reported at p95 (and p99 for
  diagnosis).
- **Correctness:** functional `checks` pass rate (token present, payment
  approved, idempotent replay returns same id, …).

We report **p95**, not average. Averages hide the tail that users actually feel;
p95 is the conventional SLO percentile and is stable enough to gate on.

## Global SLO

| Indicator | Target |
|---|---|
| Synthetic availability | ≥ 99% |
| Error rate | < 1% |
| Checks success | > 99% |
| Global p95 | < 1200 ms |

## Per-journey SLO

| Journey | p95 target | Error rate | Reasoning |
|---|---:|---:|---|
| Login | < 600 ms | < 1% | On the critical path of every session; must feel instant. |
| Invoice lookup | < 800 ms | < 1% | Read-only but DB-bound; small headroom over login for the query. |
| Plan change | < 1200 ms | < 1.5% | Extra business validation + a simulated catalog hop; higher budget, and a slightly looser error target because eligibility rules legitimately reject some requests. |
| Payment | < 1500 ms | < 1% | Highest latency budget (external gateway hop) but the **tightest** correctness bar — money must not be wrong. |

## From SLO to threshold

The per-journey budgets are encoded verbatim in
[`tests/k6/thresholds/thresholds.js`](../tests/k6/thresholds/thresholds.js):

```js
'http_req_duration{journey:login}':         ['p(95)<600'],
'http_req_duration{journey:invoice_lookup}':['p(95)<800'],
'http_req_duration{journey:plan_change}':   ['p(95)<1200'],
'http_req_duration{journey:payment}':       ['p(95)<1500'],
http_req_failed: ['rate<0.01'],
checks:          ['rate>0.99'],
```

A breach makes k6 exit non-zero, which is what turns these numbers into a real
**quality gate** in CI.

## Error budget

A 99% availability target over a window allows a 1% error budget. The intent in
this lab: smoke/load runs must stay inside budget (gating); stress/spike/soak
runs deliberately consume or exceed it to *find limits* and are therefore
non-gating (see [performance-strategy.md](performance-strategy.md)).
