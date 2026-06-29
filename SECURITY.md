# Security Policy

## Scope and posture

This repository is a **portfolio laboratory**, not a production service. It is
designed to be run locally (or as a disposable demo) and treats security as a
first-class concern even though no real data is involved.

- **All data is synthetic.** The 50 seeded customers, their invoices, and the
  `password123` credential are fictional. No real personal or financial data is
  present anywhere in the repository or its history.
- **No real secrets are committed.** The values in `docker-compose.yml` and
  `.env.example` (e.g. `JWT_SECRET=dev-only-secret-do-not-use-in-prod`,
  `POSTGRES_PASSWORD=telco`) are deliberately weak, clearly labelled lab-only
  values. They grant access to nothing outside a local machine.

## Hardening built in

- **Production safety guard.** The API refuses to boot when
  `DEPLOYMENT_ENVIRONMENT` is non-local and a known demo `JWT_SECRET` is in use
  (`assertProductionSafety()` in `apps/api/src/config.ts`).
- **Fault injection is disabled by default.** `FAULT_INJECTION_ENABLED` defaults
  to `false`; `/admin/*` endpoints stay locked unless explicitly enabled (local/CI).
- **Secrets are redacted in logs** (passwords, `Authorization`, tokens) via the
  pino `redact` configuration.
- **Auth + ownership checks.** JWT-protected routes enforce per-customer access
  with a shared `forbidIfNotOwner` guard (no cross-customer data access).
- **Idempotent payments** are enforced by a database `UNIQUE` constraint to
  prevent duplicate charges.

## Reporting a vulnerability

If you find a security issue in this lab, please open a GitHub issue describing
it, or contact the author via the GitHub profile linked in the repository. As a
non-production demo there is no formal SLA, but reports are appreciated and will
be addressed.

## Deploying publicly

Before exposing any instance to the internet, follow
[`docs/DEPLOY.md`](docs/DEPLOY.md): set a strong unique `JWT_SECRET`, keep
`FAULT_INJECTION_ENABLED=false`, and never enable the `/admin/*` fault-injection
endpoints on a public host.
