# API Error Catalog

All error responses follow a consistent shape:

```json
{ "error": "<code>", "message": "<human-readable description>" }
```

`error` is a stable machine-readable code. `message` is informational and may change between releases. Client logic must branch on `error`, never on `message`.

---

## Authentication & Authorization

| HTTP | `error` | Trigger |
|------|---------|---------|
| 401  | `invalid_credentials` | Login failed — wrong password **or** unknown username. The response is identical in both cases to prevent user enumeration. |
| 401  | `unauthorized` | A protected endpoint was called without a `Bearer` token, with an expired token, or with a tampered token. |
| 403  | `forbidden` | The authenticated customer attempted to access or modify a resource owned by a **different** customer. |
| 403  | `disabled` | An `/admin/*` endpoint was called while `FAULT_INJECTION_ENABLED` is `false` in the server environment. |

---

## Input Validation

| HTTP | `error` | Trigger |
|------|---------|---------|
| 400  | `missing_idempotency_key` | `POST /payments` was called without the required `Idempotency-Key` header, or the header value was blank. |
| 400  | *(Fastify schema message)* | Request body fails JSON Schema validation — missing required fields, wrong type, value out of allowed range, or extra properties. The `message` field contains the specific schema violation. |

---

## Business Logic

| HTTP | `error` | Trigger |
|------|---------|---------|
| 402  | — | Payment was declined by the gateway simulator. The response body uses the standard `PaymentResult` shape: `{ paymentId, status: "declined", invoiceStatus }`. |
| 404  | `not_found` | The customer referenced in a plan-change request does not exist. |
| 422  | `ineligible` | The requested `targetPlanId` does not exist in the plan catalog, **or** it is the customer's current plan (no-op change). |

---

## Idempotency Replay

`POST /payments` is fully idempotent. When a request arrives with an `Idempotency-Key` that matches a previously completed payment:

- **HTTP 200** is returned (not 201).
- The response body is identical to the original payment result.
- No second charge is created; no second database row is inserted.

The check happens in two layers (fast-path Redis cache → authoritative DB constraint on `UNIQUE(idempotency_key)`), so concurrent duplicates are safe.

---

## Fault-Injection Errors (lab only)

When `FAULT_INJECTION_ENABLED=true`, the `/admin/faults` endpoint can trigger artificial failures on any business route. These surface as:

| HTTP | Cause |
|------|-------|
| 500  | `error` fault injected on the target service. |
| 504  | `timeout` or `latency` fault causing the upstream call to exceed the configured deadline. |

Fault responses are not part of the production API contract. They exist to exercise error-handling paths in observability tooling and load tests.

---

## `/admin` Endpoints

| HTTP | `error` | Trigger |
|------|---------|---------|
| 400  | `invalid_target` | Unknown fault target name passed to `POST /admin/faults`. |
| 400  | `invalid_fault`  | Unknown fault type (must be `error`, `timeout`, or `latency`). |

---

## Health Endpoints

`GET /health/live` and `GET /health` return `200` with a JSON body under normal conditions. If dependencies (DB, Redis) are unreachable, `GET /health` returns `503` so the load-balancer can remove the instance from rotation.
