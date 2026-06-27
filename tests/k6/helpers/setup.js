// Pre-run setup helpers called from each scenario's setup() function.
// setup() in k6 runs once before VUs start, in a single goroutine — safe for
// admin operations that must complete before load begins.
import http from 'k6/http';
import { BASE_URL } from './config.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Reset all invoices to 'pending' before the run so the payment journey is
// always exercised. Without this, invoices drain to 'paid' across repeated runs
// and payment p95/error-rate go dark — the highest-risk flow stops being tested.
export function resetInvoices() {
  const res = http.post(`${BASE_URL}/admin/reset-invoices`, '{}', { headers: JSON_HEADERS });
  if (res.status !== 200) {
    console.warn(`reset-invoices -> HTTP ${res.status} (may be disabled in prod env)`);
  } else {
    const body = res.json();
    console.log(`reset-invoices -> ${body.invoicesUpdated} invoices reset to pending`);
  }
}
