// Telco self-management demo UI. Vanilla JS, no build step.
// All API calls go to /api/* which nginx reverse-proxies to the API (same-origin).

// API base is runtime-configurable via env.js (window.API_BASE). Local/same-origin
// deploys leave it empty and fall back to '/api' (nginx reverse-proxies to the API).
// A split cloud deploy sets it to the API's public origin, e.g. https://telco-api.example.com
const API = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '/api';
const state = { token: null, customerId: null, lastPayment: null };

const $ = (id) => document.getElementById(id);

function log(message, kind = 'info') {
  const el = $('activity');
  const time = new Date().toLocaleTimeString();
  const cls = kind === 'ok' ? 'line-ok' : kind === 'err' ? 'line-err' : 'line-info';
  el.innerHTML = `<span class="${cls}">[${time}] ${message}</span>\n` + el.innerHTML;
}

async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const opts = { method, headers: { ...headers } };
  if (state.token) opts.headers['Authorization'] = `Bearer ${state.token}`;
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const started = performance.now();
  const res = await fetch(`${API}${path}`, opts);
  const ms = Math.round(performance.now() - started);
  let payload = null;
  try { payload = await res.json(); } catch { /* no body */ }
  return { res, payload, ms };
}

// ---- auth ----
async function login() {
  $('loginError').classList.add('hidden');
  const username = $('username').value.trim();
  const password = $('password').value;
  const { res, payload, ms } = await api('/auth/login', { method: 'POST', body: { username, password } });
  if (!res.ok) {
    $('loginError').textContent = `Login failed (${res.status})`;
    $('loginError').classList.remove('hidden');
    return;
  }
  state.token = payload.accessToken;
  state.customerId = payload.customerId;
  $('loginCard').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('who').classList.remove('hidden');
  $('who').textContent = `Signed in as ${username} · ${state.customerId}`;
  log(`login ok in ${ms}ms — ${state.customerId}`, 'ok');
  loadInvoices();
}

function logout() {
  state.token = null; state.customerId = null; state.lastPayment = null;
  $('app').classList.add('hidden');
  $('who').classList.add('hidden');
  $('loginCard').classList.remove('hidden');
}

// ---- invoices ----
function statusBadge(s) { return `<span class="badge ${s}">${s}</span>`; }

async function loadInvoices() {
  const { res, payload, ms } = await api(`/customers/${state.customerId}/invoices`);
  const body = $('invoiceRows');
  if (!res.ok) { log(`invoice lookup failed (${res.status})`, 'err'); return; }
  log(`invoices loaded in ${ms}ms (${payload.invoices.length})`, 'ok');
  if (payload.invoices.length === 0) { body.innerHTML = '<tr><td colspan="5" class="muted">No invoices</td></tr>'; return; }
  body.innerHTML = payload.invoices.map((inv) => `
    <tr>
      <td><code>${inv.invoiceId}</code></td>
      <td>$${inv.amount.toLocaleString()}</td>
      <td>${statusBadge(inv.status)}</td>
      <td>${inv.dueDate}</td>
      <td>${inv.status === 'paid' ? '' : `<button class="primary pay" data-id="${inv.invoiceId}" data-amount="${inv.amount}">Pay</button>`}</td>
    </tr>`).join('');
  document.querySelectorAll('button.pay').forEach((b) =>
    b.addEventListener('click', () => payInvoice(b.dataset.id, Number(b.dataset.amount))));
}

// ---- payment (with idempotency) ----
async function payInvoice(invoiceId, amount) {
  const idempotencyKey = `web-${state.customerId}-${invoiceId}-${Date.now()}`;
  const { res, payload, ms } = await api('/payments', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: { customerId: state.customerId, invoiceId, amount, method: 'credit_card' },
  });
  if (res.ok) {
    state.lastPayment = { idempotencyKey, invoiceId, amount, paymentId: payload.paymentId };
    log(`payment ${payload.status} in ${ms}ms — ${payload.paymentId} (key ${idempotencyKey})`, 'ok');
    // Demonstrate idempotency: replay the same key, expect the same paymentId.
    const replay = await api('/payments', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: { customerId: state.customerId, invoiceId, amount, method: 'credit_card' },
    });
    const same = replay.payload && replay.payload.paymentId === payload.paymentId;
    log(`idempotent replay (${replay.res.status}) → ${same ? 'same paymentId ✓' : 'MISMATCH ✗'}`, same ? 'ok' : 'err');
    loadInvoices();
  } else {
    log(`payment failed (${res.status}) in ${ms}ms`, 'err');
  }
}

// ---- plan change ----
async function changePlan() {
  const targetPlanId = $('targetPlan').value;
  const { res, payload, ms } = await api(`/customers/${state.customerId}/plan-changes`, {
    method: 'POST', body: { targetPlanId },
  });
  if (res.ok) log(`plan change ${payload.status} in ${ms}ms — ${payload.changeId} (eff ${payload.effectiveDate})`, 'ok');
  else log(`plan change rejected (${res.status}) in ${ms}ms`, 'err');
}

// ---- fault injection (demo) ----
async function injectFault() {
  const target = $('faultTarget').value;
  const fault = $('faultType').value;
  const { res, payload } = await api('/admin/faults', {
    method: 'POST',
    body: { target, fault, rate: 0.3, latencyMs: 2000, durationSec: 300 },
  });
  if (res.ok) log(`fault injected: ${fault} on ${target} (30%, 2s, 5m)`, 'info');
  else log(`fault injection failed (${res.status}) ${payload ? JSON.stringify(payload) : ''}`, 'err');
}

async function clearFaults() {
  const { res } = await api('/admin/faults', { method: 'DELETE' });
  log(res.ok ? 'all faults cleared' : `clear failed (${res.status})`, res.ok ? 'ok' : 'err');
}

// ---- wiring ----
$('loginBtn').addEventListener('click', login);
$('password').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
$('logout').addEventListener('click', logout);
$('refreshInvoices').addEventListener('click', loadInvoices);
$('changePlanBtn').addEventListener('click', changePlan);
$('injectFaultBtn').addEventListener('click', injectFault);
$('clearFaultBtn').addEventListener('click', clearFaults);
