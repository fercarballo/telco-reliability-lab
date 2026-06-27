# Observability Guide

The point of this project isn't that metrics exist — it's that you can **start
from a symptom and reach a root cause** by following signals across three
pillars. This guide is the script for that investigation.

## The three pillars

| Pillar | Tool | Source in the API |
|---|---|---|
| Metrics | Prometheus → Grafana | `prom-client` registry, scraped at `/metrics` |
| Traces | Tempo (via OTel Collector) | OTel auto-instrumentation (http, pg, redis) + manual business spans |
| Logs | Loki | `pino` JSON logs shipped by `pino-loki`, each carrying `trace_id` |

The glue is **`trace_id`**: it appears on the span in Tempo and on every log line
in Loki, and Grafana is provisioned to jump between them.

## Metric → Trace → Log walkthrough

Run the degradation drill, then investigate:

```bash
docker compose run --rm k6 run /scripts/scenarios/degradation.js
```

1. **Symptom (Metrics).** Open Grafana → *Telco API — RED*
   (http://localhost:3001). The **Error rate** / **p95** stats turn red; the
   *Latency p50/p95/p99* panel shows payment latency climbing past the 1500ms
   budget. The **Active faults** stat shows `1`.
2. **Localize (Metrics).** *Request rate by route* and *Business outcomes*
   confirm the pain is isolated to `/payments`, not global.
3. **Find a slow request (Traces).** In Grafana → Explore → **Tempo**, search
   traces for `service.name = telco-api` filtered to slow ones. Open one.
4. **Read the waterfall (Traces).** The span tree shows the time is spent in
   `payment-gateway-simulator` (≈2s) — not in PostgreSQL or Redis. That points
   at the (simulated) downstream gateway, exactly where the fault lives.
5. **Pivot to logs (Trace → Log).** Click **"Logs for this span"** (the
   `tracesToLogsV2` correlation). Grafana opens Loki filtered to this trace.
6. **Confirm the cause (Logs).** The structured log line for that
   `trace_id` shows `route=/payments`, the elevated `duration_ms`, and — when
   the fault throws — a `injected fault triggered` warning with `fault_type`.
7. **Document.** Capture the trace id, the dashboard screenshot, and the log
   line. That triplet *is* the incident evidence.

The reverse path works too: from a suspicious Loki log line, the provisioned
**derived field** turns its `trace_id` into a clickable link straight to the
Tempo trace.

## Log schema

Structured JSON, one event per line. Secrets (`password`, `authorization`,
tokens) are redacted by the logger. Representative fields:

Levels are numeric pino levels (`30`=info, `40`=warn, `50`=error) — a custom
string-level formatter is incompatible with pino worker-thread transports.

```json
{
  "timestamp": "2026-06-27T15:30:00.000Z",
  "level": 30,
  "message": "request completed",
  "service": "telco-api",
  "request_id": "req-…",
  "trace_id": "…",
  "span_id": "…",
  "route": "/payments",
  "method": "POST",
  "status_code": 201,
  "duration_ms": 842
}
```

## Metrics reference

RED + business signals exposed at `/metrics`:

```
http_requests_total{route,method,status}
http_request_errors_total{route,method,status}
http_request_duration_seconds_bucket{route,method,status}
business_logins_total{status}
business_plan_changes_total{status}
business_payments_total{status}
business_payment_idempotency_conflicts_total
fault_injection_active{target,fault}
```

## Why this design

- **trace_id in logs is injected in-process** via a pino `mixin` reading the
  active OTel span. A log-shipping sidecar can't do this — it sees the bytes
  after the span context is gone.
- **Traces go through the Collector** so the project demonstrates the standard
  OTel pipeline (and you could fan out to other backends without touching the
  app). Metrics and logs take the simplest reliable path for a lab.
