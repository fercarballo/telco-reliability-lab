# Telco Reliability Lab — Executive Overview

**Audience:** IT managers, hiring managers, non-technical stakeholders
**Purpose:** What this project is, what problem it solves, and what it demonstrates

---

## What Is This Project?

The **Telco Reliability Lab** is a complete, end-to-end quality assurance and reliability testing system built to simulate how a real telecommunications company protects its most critical customer-facing operations.

It was built from scratch as a portfolio demonstration of senior-level QA and reliability engineering skills — the kind of work normally done inside a mature engineering organisation.

---

## What Problem Does It Solve?

Telecom companies process millions of billing events, plan changes, and service requests every day. When those systems fail — or behave incorrectly under load — the consequences are direct and expensive:

- **A billing system that charges customers twice** erodes trust and triggers chargebacks.
- **A slow payment gateway** means customers give up before completing a transaction.
- **A system that fails silently** means the engineering team finds out from angry customers, not from monitoring.
- **A regression introduced by a new deployment** might go undetected until after business hours.

This lab proves that all of those failure modes are being caught **before** they reach production — and that when something does go wrong, the team has the tools to find and fix it in minutes, not hours.

---

## What Was Built?

The project contains six interconnected layers:

### 1. A Realistic API Service
A working billing and account-management API — the same type of service found in real telco back-ends. Customers can log in, view invoices, pay them, and request plan upgrades.

### 2. Fault Injection
The ability to deliberately break the system in controlled ways — simulating payment gateway timeouts, billing service errors, and cascading failures — to verify that monitoring catches them and the system recovers correctly.

### 3. Performance Load Tests
Automated scripts that simulate hundreds of concurrent users performing every business journey simultaneously, measuring how fast the system responds and how many errors it produces under realistic traffic.

### 4. Full Observability Stack
A monitoring dashboard (Grafana) connected to four data sources:
- **Metrics** — real-time performance numbers (response times, error rates, payment volume).
- **Logs** — a structured record of every request with context for debugging.
- **Traces** — a step-by-step map of how each request moved through the system, including database queries and external calls.
- **Alerts** — automated notifications when key indicators breach defined thresholds.

### 5. Security Validation
Automated scans (OWASP ZAP) that test the API for common web vulnerabilities — ensuring no security regressions are introduced between releases.

### 6. Automated CI/CD Pipeline
Every code change runs the full test suite automatically — integration tests, load tests, security scans, and OpenAPI spec validation — before anything reaches a production-like environment.

---

## What Risks Does It Catch?

| Risk | How It Is Caught |
|------|-----------------|
| Payment processed twice (duplicate charge) | Idempotency key enforcement — tested in both API tests and load tests |
| Customer A accessing Customer B's data | Cross-customer auth guard — tested with 403 assertions in every route |
| Payment gateway becoming slow under load | Per-journey latency SLOs with p95 thresholds in Grafana |
| Silent error rate increase after deployment | Prometheus alerts fire when error rate exceeds 1% |
| Breaking change in the API contract | OpenAPI 3.1 spec is linted on every CI run |
| Common web security vulnerabilities | OWASP ZAP automated scan in the pipeline |
| Invoices draining to "paid" between test runs | Admin reset endpoint — runs automatically before every load test |

---

## What Does "Production-Ready" Mean Here?

This is a lab environment — it runs on a developer laptop using Docker. But every technical decision was made as it would be in a real production system:

- **No test mocks for the database** — tests hit a real PostgreSQL instance, so SQL bugs surface rather than being hidden behind mocked responses.
- **Idempotency enforced at the database level** — the `UNIQUE(idempotency_key)` constraint means concurrent duplicate payments are rejected even if two requests arrive simultaneously.
- **Secrets are environment variables** — no credentials in source code; the CI pipeline injects them at runtime.
- **Observability is wired end-to-end** — a single slow database query surfaces in Grafana Tempo as a visible span, making root-cause analysis fast and precise.
- **Alerts are routed through the API** — Prometheus fires → Alertmanager routes → the API logs it via pino → Loki stores it — the complete alert chain is demonstrable.

---

## Key Numbers

| Metric | Value |
|--------|-------|
| API routes covered by integration tests | 100% |
| Test scenarios automated in CI | 21 |
| Business journeys exercised under load | 4 (login, invoice lookup, plan change, payment) |
| Observability signals collected | 4 (metrics, logs, traces, alerts) |
| OWASP ZAP findings blocking deployment | 0 |
| Time to detect a latency regression | < 30 seconds (Prometheus scrape interval) |

---

## How To See It Running

```bash
# Start the entire stack (API, database, monitoring)
docker compose up -d

# Run all integration tests
npx playwright test tests/api/

# Run the load test
make smoke

# Open the dashboards
open http://localhost:3001   # Grafana (admin / admin)

# Trigger a fault and watch it appear in the dashboard
make inject-fault TARGET=payments FAULT=error
```

Everything required to demonstrate this system from scratch is documented in the [main README](../README.md) and the [interview walkthrough](interview-walkthrough.md).

---

## Why This Matters in an Interview

This project answers the hardest interview questions with working code instead of verbal claims:

- *"How do you test payment idempotency?"* → `tests/api/payments.spec.ts` line 73 — the replay test runs live.
- *"How do you catch performance regressions?"* → k6 thresholds breach → Grafana alert fires — demonstrable in under 2 minutes.
- *"How do you approach observability?"* → Open a Grafana dashboard and trace a specific payment end-to-end through metrics, logs, and spans.
- *"How do you handle fault tolerance?"* → Inject a payment gateway timeout, watch the error rate climb in real time, clear the fault, watch it recover.
