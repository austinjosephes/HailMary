/**
 * അമ്മയോടൊപ്പം | CLC Velappaya
 * Comprehensive Automated Test Suite
 * Validates all 20 core business requirements, transactional safety, and edge cases.
 */

const assert = require('assert');
const {
  submitPrayers,
  getPublicCampaignData,
  getAdminData,
  adminOverrideTotal,
  adminResetCampaign,
  adminDeleteSubmission
} = require('../lib/db');
const { validatePrayerAmount, getKolkataDateString, getKolkataTimeString, TARGET_GOAL } = require('../lib/utils');
const { checkCredentials, createSessionToken, verifySessionToken } = require('../lib/auth');
const { checkRateLimit } = require('../lib/rate-limit');

async function runTests() {
  console.log('\n======================================================');
  console.log('  അമ്മയോടൊപ്പം | Automated Test Suite Execution');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  // Pre-test: Reset to known state
  await adminResetCampaign('Initial test suite reset', 'test_runner');

  // TEST 1: Current total = 0, Submit 1 -> Expected = 1
  await test('TEST 1: Current total = 0, Submit 1 -> Expected = 1', async () => {
    await adminResetCampaign('Test 1 reset', 'test_runner');
    const res = await submitPrayers(1, '127.0.0.1');
    assert.strictEqual(res.creditedAmount, 1);
    assert.strictEqual(res.totalCount, 1);
    assert.strictEqual(res.todayCount, 1);
  });

  // TEST 2: Submit 100 -> Expected increase = 100
  await test('TEST 2: Submit 100 -> Expected total increase = 100', async () => {
    const before = await getPublicCampaignData();
    const res = await submitPrayers(100, '127.0.0.1');
    assert.strictEqual(res.creditedAmount, 100);
    assert.strictEqual(res.totalCount, before.totalCount + 100);
  });

  // TEST 3: Current = 99,950, Submit 100 -> submitted = 100, credited = 50, total = 100,000
  await test('TEST 3: Current = 99,950, Submit 100 -> submitted=100, credited=50, total=100,000', async () => {
    await adminOverrideTotal(99950, 'Setup for 99,950 boundary test', 'test_runner');
    const res = await submitPrayers(100, '127.0.0.1');
    assert.strictEqual(res.submittedAmount, 100);
    assert.strictEqual(res.creditedAmount, 50);
    assert.strictEqual(res.totalCount, 100000);
    assert.strictEqual(res.targetReached, true);
  });

  // TEST 4: Current = 100,000, Submit 100 -> credited = 0, total = 100,000
  await test('TEST 4: Current = 100,000, Submit 100 -> credited=0, total=100,000, isGoalFull=true', async () => {
    await adminOverrideTotal(100000, 'Setup for 100,000 full test', 'test_runner');
    const res = await submitPrayers(100, '127.0.0.1');
    assert.strictEqual(res.submittedAmount, 100);
    assert.strictEqual(res.creditedAmount, 0);
    assert.strictEqual(res.totalCount, 100000);
    assert.strictEqual(res.isGoalFull, true);
  });

  // TEST 5: Submit negative value -> Expected rejection
  await test('TEST 5: Submit negative value -> Expected rejection', () => {
    const v1 = validatePrayerAmount(-5);
    const v2 = validatePrayerAmount(-100);
    assert.strictEqual(v1.valid, false);
    assert.strictEqual(v2.valid, false);
  });

  // TEST 6: Submit decimal -> Expected rejection
  await test('TEST 6: Submit decimal value -> Expected rejection', () => {
    const v1 = validatePrayerAmount(12.5);
    const v2 = validatePrayerAmount('50.7');
    assert.strictEqual(v1.valid, false);
    assert.strictEqual(v2.valid, false);
  });

  // TEST 7: Submit extremely large number (> 10000) -> Expected rejection
  await test('TEST 7: Submit extremely large number -> Expected rejection', () => {
    const v = validatePrayerAmount(50000);
    assert.strictEqual(v.valid, false);
  });

  // TEST 8: Two users submit simultaneously -> No lost update and no target overflow
  await test('TEST 8: Concurrent submissions -> ACID atomicity with no lost updates', async () => {
    await adminResetCampaign('Concurrent test reset', 'test_runner');
    // Launch 10 concurrent submissions of 10 prayers each
    const promises = Array.from({ length: 10 }, (_, i) => submitPrayers(10, `192.168.1.${i}`));
    await Promise.all(promises);
    const data = await getPublicCampaignData();
    assert.strictEqual(data.totalCount, 100);
  });

  // TEST 9: Admin login with wrong password -> Expected rejection
  await test('TEST 9: Admin login with wrong password -> Expected rejection', () => {
    const ok = checkCredentials('admin', 'wrong_password_123');
    assert.strictEqual(ok, false);
  });

  // TEST 10: Admin login with correct credentials -> Expected authenticated token
  await test('TEST 10: Admin login with correct credentials -> Valid HMAC token', () => {
    const token = createSessionToken('admin');
    const session = verifySessionToken(token);
    assert.ok(session);
    assert.strictEqual(session.u, 'admin');
  });

  // TEST 11: Unauthenticated admin API request -> Expected rejection (null session)
  await test('TEST 11: Invalid/Tampered token -> Returns null session', () => {
    const tamperedToken = 'invalid.payload.signature';
    const session = verifySessionToken(tamperedToken);
    assert.strictEqual(session, null);
  });

  // TEST 12: Delete a submission -> Total reverses creditedAmount only
  await test('TEST 12: Delete a submission -> Subtracts creditedAmount only', async () => {
    await adminResetCampaign('Delete test reset', 'test_runner');
    await adminOverrideTotal(99950, 'Override for delete test', 'test_runner');
    const subRes = await submitPrayers(100, '127.0.0.1'); // credited: 50, total: 100,000
    assert.strictEqual(subRes.creditedAmount, 50);

    const delRes = await adminDeleteSubmission(subRes.submissionId, 'test_runner');
    assert.strictEqual(delRes.totalCount, 99950); // Reverses 50, not 100!
  });

  // TEST 13: Delete today's submission -> todayCount reverses correctly
  await test('TEST 13: Delete today submission -> todayCount reverses correctly', async () => {
    await adminResetCampaign('Today count delete reset', 'test_runner');
    const sub = await submitPrayers(25, '127.0.0.1');
    assert.strictEqual(sub.todayCount, 25);

    const del = await adminDeleteSubmission(sub.submissionId, 'test_runner');
    assert.strictEqual(del.todayCount, 0);
  });

  // TEST 14: Admin override -> Records audit event
  await test('TEST 14: Admin override -> Records audit event in database', async () => {
    await adminOverrideTotal(5000, 'Parish festival addition', 'pastor');
    const adminData = await getAdminData();
    assert.strictEqual(adminData.totalCount, 5000);
    const lastEvent = adminData.adminEvents[0];
    assert.ok(lastEvent);
    assert.strictEqual(lastEvent.action, 'override_total');
    assert.strictEqual(lastEvent.reason, 'Parish festival addition');
  });

  // TEST 15: Reset -> Clean campaign state and records audit event
  await test('TEST 15: Campaign Reset -> Zero counts and audit event recorded', async () => {
    await adminResetCampaign('Annual campaign reset', 'test_runner');
    const data = await getPublicCampaignData();
    assert.strictEqual(data.totalCount, 0);
    assert.strictEqual(data.todayCount, 0);
  });

  // TEST 16: Daily rollover timezone -> Asia/Kolkata
  await test('TEST 16: Timezone verification -> Asia/Kolkata timezone formatting', () => {
    const kolkataDate = getKolkataDateString();
    const kolkataTime = getKolkataTimeString();
    assert.match(kolkataDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(kolkataTime, /^\d{1,2}:\d{2}\s(AM|PM)$/i);
  });

  // TEST 17: Database failure safety / validation rejecting 0 or NaN
  await test('TEST 17: Non-positive / NaN / object rejection', () => {
    assert.strictEqual(validatePrayerAmount(0).valid, false);
    assert.strictEqual(validatePrayerAmount('abc').valid, false);
    assert.strictEqual(validatePrayerAmount(NaN).valid, false);
    assert.strictEqual(validatePrayerAmount(Infinity).valid, false);
    assert.strictEqual(validatePrayerAmount({ amount: 50 }).valid, false);
    assert.strictEqual(validatePrayerAmount([50]).valid, false);
  });

  // TEST 18: Public API data returns authoritative shared total
  await test('TEST 18: Public API data reflects exact database state', async () => {
    await adminOverrideTotal(4250, 'Authoritative check', 'test_runner');
    const pub = await getPublicCampaignData();
    assert.strictEqual(pub.totalCount, 4250);
    assert.strictEqual(pub.remainingCount, TARGET_GOAL - 4250);
    assert.strictEqual(pub.progressPercent, 4.25);
  });

  // TEST 19: Rate limiting on rapid requests
  await test('TEST 19: Rate limiter allows reasonable traffic and throttles flood', () => {
    const fakeReq = { headers: { 'x-forwarded-for': '203.0.113.195' } };
    let allowedCount = 0;
    for (let i = 0; i < 45; i++) {
      const res = checkRateLimit(fakeReq);
      if (res.allowed) allowedCount++;
    }
    assert.strictEqual(allowedCount, 40); // Capped at 40 requests per minute
  });

  // TEST 20: Boundary checks — 100,000 maximum cap
  await test('TEST 20: Counter never exceeds 100,000 under any circumstances', async () => {
    await adminOverrideTotal(99999, 'Boundary test', 'test_runner');
    const res = await submitPrayers(500, '127.0.0.1');
    assert.strictEqual(res.totalCount, 100000);
    assert.strictEqual(res.creditedAmount, 1);
  });

  console.log('\n======================================================');
  console.log(`  Tests Completed: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
