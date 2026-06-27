// Synthetic user picker. Mirrors infra/postgres/generate-seed.mjs so we can
// derive each user's current plan (and therefore a guaranteed-different target
// plan) without an extra round-trip. Keep in sync with the seed generator.

const PLAN_IDS = ['mobile_basic', 'mobile_premium', 'fiber_300mb', 'fiber_600mb', 'fiber_1000mb'];
const CUSTOMER_COUNT = 50;

export function pickUser() {
  const n = Math.floor(Math.random() * CUSTOMER_COUNT) + 1; // 1..50
  const idx = String(n).padStart(3, '0');
  const currentPlanIdx = n % PLAN_IDS.length; // matches seed: plans[i % len]
  const targetPlanIdx = (currentPlanIdx + 1) % PLAN_IDS.length; // guaranteed different
  return {
    username: `user_${idx}`,
    password: 'password123',
    customerId: `customer_${idx}`,
    targetPlanId: PLAN_IDS[targetPlanIdx],
  };
}
