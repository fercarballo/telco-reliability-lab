# Reliability Testing

## Idempotent payments under concurrency

The payment endpoint is the highest-risk flow: a duplicate charge is a
correctness *and* trust failure. The design guarantees that **the same
`Idempotency-Key` never produces two charges**, even under concurrent retries.

### How it works

1. **Fast path (Redis):** if a settled result is cached for the key, return it
   immediately with `200` (a replay).
2. **Source of truth (PostgreSQL):** inside a transaction,
   ```sql
   INSERT INTO payments (... , idempotency_key)
   VALUES (...) ON CONFLICT (idempotency_key) DO NOTHING
   RETURNING payment_id;
   ```
   - If a row is returned, this request **won** — it charges the gateway and
     settles the invoice, then caches the result.
   - If no row is returned, a concurrent request already created it — we
     `SELECT` the existing payment and return it with `200`.

The `UNIQUE` index on `idempotency_key` is what makes this race-safe: the
database, not the application, arbitrates the winner. Two simultaneous requests
with the same key cannot both insert.

### How the tests prove it

- Every k6 payment iteration immediately **replays** the identical request with
  the same key and asserts `status === 200` **and** the same `paymentId`
  (`tests/k6/helpers/journeys.js`). The custom `payment_idempotency_conflicts`
  counter records each correctly-deduplicated replay.
- The API surfaces `business_payment_idempotency_conflicts_total` so the same
  property is visible in Prometheus, not just in the k6 summary.

## Fault injection

`POST /admin/faults` installs a fault for a target (`auth | billing | plans |
payments | global`):

```bash
curl -X POST localhost:3000/admin/faults -H 'content-type: application/json' \
  -d '{"target":"payments","fault":"latency","rate":0.3,"latencyMs":2000,"durationSec":300}'
curl -X DELETE localhost:3000/admin/faults   # clear
```

| Fault | What it does | What it validates |
|---|---|---|
| `latency` | Sleeps `latencyMs` for `rate` of requests | p95/p99 climb; trace shows the slow span |
| `error` | Throws a 500 for `rate` of requests | error-rate SLI; error budget burn |
| `timeout` | Hangs ≥5s then fails 504 | client/server resilience; trace + log of the hang |

Faults auto-expire after `durationSec` and are gated behind
`FAULT_INJECTION_ENABLED` so they can never fire in a non-lab environment.

The payments fault is applied *inside* the `payment-gateway-simulator` span on
purpose, so a latency fault shows up in Tempo exactly where a real slow
downstream dependency would.

## The degradation drill

`tests/k6/scenarios/degradation.js` is a one-command resilience demo: `setup()`
injects a 2s payment latency fault, the run holds steady load, `teardown()`
clears it. While it runs you can watch the RED dashboard react and then trace the
cause down to a single log line — see
[observability-guide.md](observability-guide.md).
