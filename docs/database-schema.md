# Database Schema

The lab uses a single PostgreSQL database (`telco`). All tables are created by [`infra/postgres/init/01-schema.sql`](../infra/postgres/init/01-schema.sql) and seeded by [`02-seed.sql`](../infra/postgres/init/02-seed.sql) on first boot.

---

## Entity-Relationship Overview

```
plans ──< customers ──< invoices
                   └──< plan_changes
customers ──< payments ──(references)──> invoices
```

---

## Tables

### `plans`

Stores the product catalog. Referenced by `customers.current_plan_id`.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `plan_id` | `TEXT` | `PRIMARY KEY` | Stable slug, e.g. `fiber_600mb`. |
| `name` | `TEXT` | `NOT NULL` | Display name, e.g. `Fiber 600`. |
| `price` | `NUMERIC(12,2)` | `NOT NULL` | Monthly price in cents (e.g. `25999.99` = $259.99). |
| `speed_mbps` | `INTEGER` | `NOT NULL` | Advertised download speed. |

Seeded with 5 plans: `mobile_basic`, `mobile_premium`, `fiber_300mb`, `fiber_600mb`, `fiber_1000mb`.

---

### `customers`

One row per registered subscriber. Acts as the authentication principal.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `customer_id` | `TEXT` | `PRIMARY KEY` | Stable ID, e.g. `customer_001`. Embedded in JWTs as `sub`. |
| `username` | `TEXT` | `UNIQUE NOT NULL` | Login handle, e.g. `user_001`. |
| `password_hash` | `TEXT` | `NOT NULL` | SHA-256 of the plaintext password. **Synthetic data only** — all seed passwords are `password123`. |
| `segment` | `TEXT` | `NOT NULL DEFAULT 'consumer'` | Either `consumer` or `business`. Used for load-test segmentation. |
| `current_plan_id` | `TEXT` | `REFERENCES plans(plan_id)` | FK to the plan the customer currently holds. `NULL` = no active plan. |

Seeded with 50 customers (`customer_001` – `customer_050`).

---

### `invoices`

Monthly billing documents. The primary driver of the payment journey.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `invoice_id` | `TEXT` | `PRIMARY KEY` | e.g. `inv_001_1`. |
| `customer_id` | `TEXT` | `NOT NULL REFERENCES customers` | Owner of this invoice. |
| `amount` | `NUMERIC(12,2)` | `NOT NULL` | Amount due (must match `payments.amount` for payment to approve). |
| `status` | `TEXT` | `NOT NULL DEFAULT 'pending'` | `pending` \| `paid` \| `overdue`. Updated to `paid` on successful payment. |
| `due_date` | `DATE` | `NOT NULL` | Billing due date. |

**Index:** `idx_invoices_customer ON invoices(customer_id)` — filters per-customer invoice lists.

**Admin reset:** `POST /admin/reset-invoices` sets all `status` back to `pending`, allowing repeated load-test runs to always find payable invoices.

---

### `payments`

A write-once ledger of payment attempts. The idempotency contract is enforced here.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `payment_id` | `TEXT` | `PRIMARY KEY` | Generated as `pay_<8-char UUID>`. |
| `customer_id` | `TEXT` | `NOT NULL` | Denormalised from the request body (not a FK, for audit resilience). |
| `invoice_id` | `TEXT` | `NOT NULL` | Invoice being paid. |
| `amount` | `NUMERIC(12,2)` | `NOT NULL` | Amount submitted by the caller. |
| `method` | `TEXT` | `NOT NULL` | `credit_card` \| `debit_card` \| `bank_transfer`. |
| `status` | `TEXT` | `NOT NULL DEFAULT 'pending'` | `pending` → `approved` or `declined` after gateway response. |
| `idempotency_key` | `TEXT` | `NOT NULL` | Caller-supplied deduplication key from `Idempotency-Key` header. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Immutable write timestamp. |

**Critical constraint:** `UNIQUE INDEX uq_payments_idempotency_key ON payments(idempotency_key)` — this is the database-level guarantee that prevents duplicate charges under concurrent retries. The application layer uses `INSERT ... ON CONFLICT DO NOTHING` and inspects `rowCount` to detect collisions.

**Index:** `idx_payments_invoice ON payments(invoice_id)` — supports auditing which payments reference a given invoice.

---

### `plan_changes`

Scheduled subscription changes. The API creates them; a hypothetical background worker would apply them on `effective_date` (not implemented in this lab — the focus is on the scheduling + observability of the API call).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `change_id` | `TEXT` | `PRIMARY KEY` | Generated as `chg_<8-char UUID>`. |
| `customer_id` | `TEXT` | `NOT NULL REFERENCES customers` | Customer requesting the change. |
| `target_plan_id` | `TEXT` | `NOT NULL` | The plan being requested (validated against `plans` at request time). |
| `status` | `TEXT` | `NOT NULL DEFAULT 'scheduled'` | `scheduled` \| `applied` \| `rejected`. |
| `effective_date` | `DATE` | `NOT NULL` | Set to 4 calendar days from the request date. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Request timestamp. |

**Index:** `idx_plan_changes_customer ON plan_changes(customer_id)`.

---

## Connection Pool

The API uses a single `pg.Pool` shared across all requests:

| Setting | Value |
|---------|-------|
| Max connections | `config.postgres.poolMax` (default: 10) |
| Connection timeout | 5 000 ms |
| Idle timeout | 30 000 ms |

All pool connections are automatically instrumented by OpenTelemetry's `pg` auto-instrumentation — every query appears as a child span of the parent HTTP span in Grafana Tempo.

---

## Transaction Boundaries

The payment flow runs inside a single serializable-equivalent transaction via `withTransaction()` in [`apps/api/src/db.ts`](../apps/api/src/db.ts):

1. `INSERT INTO payments ... ON CONFLICT DO NOTHING` — unique-key gate.
2. `SELECT ... FROM invoices ... FOR UPDATE` — row lock on the invoice being paid.
3. Gateway call (outside SQL, inside the transaction — intentional: keeps the payment row in `pending` until the gateway responds).
4. `UPDATE payments SET status = ...` + `UPDATE invoices SET status = 'paid'` — atomic settlement.

A `ROLLBACK` is issued on any exception, releasing the row lock.
