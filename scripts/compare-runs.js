#!/usr/bin/env node
// Run-to-run performance comparison.
// Usage: node scripts/compare-runs.js <baseline.json> <current.json> [--fail-on-regression]
//
// Reads two k6 --summary-export JSON files and prints a Markdown table comparing
// global p95, error rate, checks rate, and per-journey p95. Exits 1 if any metric
// regresses beyond the configured thresholds when --fail-on-regression is set.

import { readFileSync } from 'fs';

const REGRESSION_P95_WARN_PCT  = 10;   // warn  if p95 increases ≥ 10%
const REGRESSION_P95_FAIL_PCT  = 25;   // fail  if p95 increases ≥ 25%
const REGRESSION_ERR_FAIL_ABS  = 0.005; // fail  if error rate increases ≥ 0.5 pp
const REGRESSION_CHK_FAIL_ABS  = 0.01;  // fail  if checks rate drops  ≥ 1 pp

const JOURNEYS = ['login', 'invoice_lookup', 'plan_change', 'payment'];
const SLO_P95  = { login: 600, invoice_lookup: 800, plan_change: 1200, payment: 1500 };

const args = process.argv.slice(2);
const failOnRegression = args.includes('--fail-on-regression');
const files = args.filter(a => !a.startsWith('--'));

if (files.length !== 2) {
  console.error('Usage: node compare-runs.js <baseline.json> <current.json> [--fail-on-regression]');
  process.exit(2);
}

function load(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const m = raw.metrics ?? {};
  return {
    p95_global:  m['http_req_duration']?.['p(95)']          ?? null,
    error_rate:  m['http_req_failed']?.['value']             ?? null,
    checks_rate: m['checks']?.['value']                      ?? null,
    journeys: Object.fromEntries(
      JOURNEYS.map(j => [j, m[`http_req_duration{journey:${j}}`]?.['p(95)'] ?? null])
    ),
  };
}

const baseline = load(files[0]);
const current  = load(files[1]);

function pct(base, cur) {
  if (base == null || cur == null) return null;
  return ((cur - base) / base) * 100;
}

function fmtMs(v) { return v == null ? 'N/A' : `${v.toFixed(1)} ms`; }
function fmtPct(v) { return v == null ? 'N/A' : `${(v*100).toFixed(2)}%`; }
function fmtDelta(d) {
  if (d == null) return '—';
  const sign = d >= 0 ? '+' : '';
  return `${sign}${d.toFixed(1)}%`;
}

function badge(d, warnPct, failPct, invert = false) {
  if (d == null) return '⚪';
  const bad = invert ? d < 0 : d > 0;
  if (!bad) return '✅';
  const absDelta = Math.abs(d);
  if (absDelta >= failPct) return '🔴';
  if (absDelta >= warnPct) return '🟡';
  return '✅';
}

function badgeAbs(base, cur, failAbs, invert = false) {
  if (base == null || cur == null) return '⚪';
  const diff = cur - base;
  const bad = invert ? diff < -failAbs : diff > failAbs;
  return bad ? '🔴' : '✅';
}

const rows = [];
let hasFailure = false;
let hasWarn = false;

// Global p95
const gDelta = pct(baseline.p95_global, current.p95_global);
const gBadge = badge(gDelta, REGRESSION_P95_WARN_PCT, REGRESSION_P95_FAIL_PCT);
rows.push(`| Global p95 | — | ${fmtMs(baseline.p95_global)} | ${fmtMs(current.p95_global)} | ${fmtDelta(gDelta)} | ${gBadge} |`);
if (gBadge === '🔴') hasFailure = true;
if (gBadge === '🟡') hasWarn = true;

// Error rate
const eBadge = badgeAbs(baseline.error_rate, current.error_rate, REGRESSION_ERR_FAIL_ABS);
const eDiff = current.error_rate != null && baseline.error_rate != null
  ? ((current.error_rate - baseline.error_rate) * 100).toFixed(3) + ' pp'
  : '—';
rows.push(`| Error rate | < 1% | ${fmtPct(baseline.error_rate)} | ${fmtPct(current.error_rate)} | ${eDiff} | ${eBadge} |`);
if (eBadge === '🔴') hasFailure = true;

// Checks rate
const cBadge = badgeAbs(baseline.checks_rate, current.checks_rate, REGRESSION_CHK_FAIL_ABS, true);
const cDiff = current.checks_rate != null && baseline.checks_rate != null
  ? ((current.checks_rate - baseline.checks_rate) * 100).toFixed(3) + ' pp'
  : '—';
rows.push(`| Checks rate | > 99% | ${fmtPct(baseline.checks_rate)} | ${fmtPct(current.checks_rate)} | ${cDiff} | ${cBadge} |`);
if (cBadge === '🔴') hasFailure = true;

// Per-journey p95
for (const j of JOURNEYS) {
  const slo = SLO_P95[j];
  const d = pct(baseline.journeys[j], current.journeys[j]);
  const b = badge(d, REGRESSION_P95_WARN_PCT, REGRESSION_P95_FAIL_PCT);
  rows.push(`| ${j} p95 | < ${slo} ms | ${fmtMs(baseline.journeys[j])} | ${fmtMs(current.journeys[j])} | ${fmtDelta(d)} | ${b} |`);
  if (b === '🔴') hasFailure = true;
  if (b === '🟡') hasWarn = true;
}

const status = hasFailure ? '🔴 REGRESSION DETECTED' : hasWarn ? '🟡 REGRESSION WARNING' : '✅ NO REGRESSION';

console.log(`## Run-to-run comparison\n`);
console.log(`**Baseline:** \`${files[0]}\`  `);
console.log(`**Current:**  \`${files[1]}\`\n`);
console.log(`**Result: ${status}**\n`);
console.log(`| Metric | SLO | Baseline | Current | Δ | Status |`);
console.log(`|---|---|---|---|---|---|`);
rows.forEach(r => console.log(r));
console.log();
console.log(`> 🟡 warn ≥ ${REGRESSION_P95_WARN_PCT}% p95 increase  |  🔴 fail ≥ ${REGRESSION_P95_FAIL_PCT}% p95 increase or ≥ 0.5 pp error rate increase`);

if (failOnRegression && hasFailure) {
  console.error('\nExiting 1 — regression threshold breached.');
  process.exit(1);
}
