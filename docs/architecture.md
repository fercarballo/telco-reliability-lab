# Architecture

## Tech stack

| Layer | Technology | Version |
|-------|------------|---------|
| Runtime | Node.js | 24 (LTS) |
| Language | TypeScript | 6.x |
| HTTP framework | Fastify | 5.x |
| Database | PostgreSQL | 17 |
| Cache / session store | Redis | 8 |
| Performance testing | k6 | latest |
| Functional testing | Playwright (`APIRequestContext`) | 1.49+ |
| Metrics | prom-client → Prometheus | 15.x → latest |
| Distributed tracing | OpenTelemetry → OTel Collector → Grafana Tempo | auto-instrumentations 0.77+ |
| Structured logs | pino + pino-loki → Grafana Loki | 10.x |
| Dashboards | Grafana | latest |
| Alerting | Prometheus alert rules + Alertmanager | latest |
| API contract | OpenAPI 3.1 (Redocly lint) | — |
| Security scan | OWASP ZAP baseline | stable |
| CI | GitHub Actions + GitLab CI | — |
| Container runtime | Docker + Docker Compose | — |

## System under test

A deliberately small but realistic telco self-management API. The four journeys
mirror the highest-risk flows of a real carrier portal:

| Journey | Endpoint | Why it matters |
|---|---|---|
| Login | `POST /auth/login` | Gate to everything; spikes on incidents/campaigns |
| Invoice lookup | `GET /customers/:id/invoices` | Read-heavy, DB-bound, spikes at due dates |
| Plan change | `POST /customers/:id/plan-changes` | Business logic + internal catalog dependency |
| Payment | `POST /payments` | Highest risk: money, concurrency, idempotency |

Supporting endpoints: `GET /health`, `GET /health/live`, `GET /metrics`,
and `POST|GET|DELETE /admin/faults` (fault injection, gated by env).

## Components

```
Synthetic users (k6) ─┐
                      ▼
                 Telco API (Fastify/TS) ──► PostgreSQL   (transactional data)
                      │   │                └► Redis       (sessions, idempotency cache)
                      │   │
   /metrics (scrape) ─┘   └─ OTLP traces ──► OTel Collector ──► Tempo
                      │
   structured logs ───┴──────────────────────────────────► Loki
                      ▼
              Prometheus ──► Grafana ◄── Tempo, Loki   (dashboards + correlation)
```

## Key technical decisions & trade-offs

- **Fastify over Express/Nest.** First-class TypeScript, very low per-request
  overhead (so the framework isn't the bottleneck we're measuring), and a clean
  hook lifecycle that makes the single RED-metrics `onResponse` hook trivial.

- **Metrics via `prom-client` + scrape, not OTLP metrics.** The Prometheus pull
  model is the lingua franca for this kind of dashboard, keeps the metric names
  explicit/stable, and avoids a second moving part. Traces still flow through the
  OTel Collector, so the project still demonstrates the collector pattern.

- **Logs via `pino-loki`, not a log-scraping sidecar.** Avoids mounting the
  Docker socket (which is awkward/cross-platform-fragile) and keeps `trace_id`
  injection in-process, where the active span is actually available.

- **Idempotency enforced in PostgreSQL, not the application.** A `UNIQUE`
  constraint on `idempotency_key` is the source of truth under concurrency;
  Redis is only a fast-path cache. See [reliability-testing.md](reliability-testing.md).

- **Route-templated metric labels.** Labels use `/customers/:customerId/invoices`,
  never the raw URL, to keep Prometheus cardinality bounded.

- **Fault injection is in-process and env-gated.** No external chaos tooling
  needed for the demo; `FAULT_INJECTION_ENABLED` must be true (local/CI only).

## Security model

Authentication uses **stateless JWT** (HS256, signed with `JWT_SECRET`). Every protected route registers `preHandler: app.authenticate`, which verifies the token via `@fastify/jwt` and writes `request.authCustomerId = jwt.sub`. Route handlers then call `forbidIfNotOwner(request, reply, resourceCustomerId)` to enforce that a customer cannot access another customer's data — returning `403 forbidden` on mismatch.

Admin endpoints (`/admin/*`) are gated separately by `FAULT_INJECTION_ENABLED`. If the env flag is `false`, all admin routes return `403 disabled` regardless of the caller's identity.

Secrets (`password`, `authorization`, tokens) are scrubbed from all log lines by pino's `redact` configuration — even if a handler accidentally serialises the request object.

## Request lifecycle (payment)

1. `onRequest` assigns `request_id` (`req-<uuid>`).
2. OTel auto-instrumentation starts the HTTP server span.
3. Handler checks the Redis idempotency cache (fast replay path).
4. A DB transaction inserts the payment with `ON CONFLICT DO NOTHING` — the
   unique key decides the winner under concurrency.
5. The winner calls the `payment-gateway-simulator` span (where injected
   payment faults surface) and settles the invoice.
6. `onResponse` records RED metrics + the structured access log (carrying
   `trace_id`), so this request is now visible in Prometheus, Tempo, and Loki.
