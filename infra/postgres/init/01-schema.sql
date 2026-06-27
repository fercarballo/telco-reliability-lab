-- Telco Reliability Lab — transactional schema.
-- Loaded automatically by the postgres image on first boot (docker-entrypoint-initdb.d).

CREATE TABLE IF NOT EXISTS plans (
    plan_id     TEXT PRIMARY KEY,
    name        TEXT        NOT NULL,
    price       NUMERIC(12, 2) NOT NULL,
    speed_mbps  INTEGER     NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
    customer_id     TEXT PRIMARY KEY,
    username        TEXT UNIQUE NOT NULL,
    password_hash   TEXT        NOT NULL,           -- sha256(password); synthetic data only
    segment         TEXT        NOT NULL DEFAULT 'consumer',
    current_plan_id TEXT        REFERENCES plans (plan_id)
);

CREATE TABLE IF NOT EXISTS invoices (
    invoice_id  TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers (customer_id),
    amount      NUMERIC(12, 2) NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',    -- pending | paid | overdue
    due_date    DATE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices (customer_id);

CREATE TABLE IF NOT EXISTS payments (
    payment_id      TEXT PRIMARY KEY,
    customer_id     TEXT NOT NULL,
    invoice_id      TEXT NOT NULL,
    amount          NUMERIC(12, 2) NOT NULL,
    method          TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending', -- pending | approved | declined
    idempotency_key TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The backbone of idempotent payments: one row per Idempotency-Key, enforced by the DB.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_idempotency_key ON payments (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments (invoice_id);

CREATE TABLE IF NOT EXISTS plan_changes (
    change_id       TEXT PRIMARY KEY,
    customer_id     TEXT NOT NULL REFERENCES customers (customer_id),
    target_plan_id  TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | applied | rejected
    effective_date  DATE NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_changes_customer ON plan_changes (customer_id);
