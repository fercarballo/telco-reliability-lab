import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, JSON_HEADERS, JOURNEY } from './config.js';
import { pickUser } from '../data/users.js';
import {
  loginDuration,
  loginSuccessRate,
  invoiceLookupDuration,
  invoiceLookupSuccessRate,
  planChangeDuration,
  planChangeSuccessRate,
  paymentDuration,
  paymentSuccessRate,
  paymentIdempotencyConflicts,
} from './metrics.js';

// Each request is tagged with `journey:<name>` so the thresholds file can assert
// http_req_duration{journey:payment} etc. independently per business flow.

export function login(user) {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ username: user.username, password: user.password }),
    { headers: JSON_HEADERS, tags: { journey: JOURNEY.LOGIN } },
  );
  const ok = check(res, {
    'login: status 200': (r) => r.status === 200,
    'login: token present': (r) => !!r.json('accessToken'),
    'login: customerId present': (r) => !!r.json('customerId'),
  });
  loginDuration.add(res.timings.duration);
  loginSuccessRate.add(ok);
  return ok ? { token: res.json('accessToken'), customerId: res.json('customerId') } : null;
}

export function listInvoices(token, customerId) {
  const res = http.get(`${BASE_URL}/customers/${customerId}/invoices`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { journey: JOURNEY.INVOICE_LOOKUP },
  });
  const ok = check(res, {
    'invoices: status 200': (r) => r.status === 200,
    'invoices: list present': (r) => Array.isArray(r.json('invoices')),
  });
  invoiceLookupDuration.add(res.timings.duration);
  invoiceLookupSuccessRate.add(ok);
  return ok ? res.json('invoices') : [];
}

export function changePlan(token, customerId, targetPlanId) {
  const res = http.post(
    `${BASE_URL}/customers/${customerId}/plan-changes`,
    JSON.stringify({ targetPlanId }),
    { headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` }, tags: { journey: JOURNEY.PLAN_CHANGE } },
  );
  const ok = check(res, {
    'plan change: status 202': (r) => r.status === 202,
    'plan change: changeId present': (r) => !!r.json('changeId'),
    'plan change: scheduled': (r) => r.json('status') === 'scheduled',
  });
  planChangeDuration.add(res.timings.duration);
  planChangeSuccessRate.add(ok);
  return ok;
}

export function payInvoice(token, customerId, invoice) {
  const idempotencyKey = `pay-${customerId}-${invoice.invoiceId}-${__VU}-${__ITER}`;
  const headers = { ...JSON_HEADERS, Authorization: `Bearer ${token}`, 'Idempotency-Key': idempotencyKey };
  const body = JSON.stringify({
    customerId,
    invoiceId: invoice.invoiceId,
    amount: invoice.amount,
    method: 'credit_card',
  });

  const res = http.post(`${BASE_URL}/payments`, body, { headers, tags: { journey: JOURNEY.PAYMENT } });
  const ok = check(res, {
    'payment: status 200/201': (r) => r.status === 200 || r.status === 201,
    'payment: paymentId present': (r) => !!r.json('paymentId'),
    'payment: approved': (r) => r.json('status') === 'approved',
  });
  paymentDuration.add(res.timings.duration);
  paymentSuccessRate.add(ok);

  // Idempotency assertion: replay the SAME key, expect the SAME payment back, no duplicate.
  if (ok) {
    const replay = http.post(`${BASE_URL}/payments`, body, { headers, tags: { journey: JOURNEY.PAYMENT } });
    const idempotent = check(replay, {
      'payment replay: status 200': (r) => r.status === 200,
      'payment replay: same paymentId': (r) => r.json('paymentId') === res.json('paymentId'),
    });
    if (idempotent) paymentIdempotencyConflicts.add(1);
  }
  return ok;
}

// The end-to-end self-management journey: login -> read invoices -> change plan -> pay.
export function fullJourney() {
  const user = pickUser();

  const session = login(user);
  if (!session) {
    sleep(1);
    return;
  }

  const invoices = listInvoices(session.token, session.customerId);
  changePlan(session.token, session.customerId, user.targetPlanId);

  const payable = invoices.find((inv) => inv.status !== 'paid');
  if (payable) {
    payInvoice(session.token, session.customerId, payable);
  }

  sleep(Math.random() * 1 + 0.5); // 0.5-1.5s think time
}
