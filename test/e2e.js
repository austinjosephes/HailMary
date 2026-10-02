const assert = require('assert');
const fs = require('fs');

async function testE2E() {
  console.log('\n======================================================');
  console.log('  E2E Static & DOM Integrity Verification');
  console.log('======================================================\n');

  // 1. Static Asset Delivery Verification
  const pages = ['/', '/index.html', '/admin.html', '/style.css', '/script.js'];
  for (const page of pages) {
    const res = await fetch('http://localhost:8000' + page);
    assert.strictEqual(res.status, 200, `Page failed: ${page}`);
    console.log(`  ✅ Loaded static resource: ${page} (status 200)`);
  }

  // 2. DOM ID verification between app.js and index.html
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  
  const requiredIndexIds = [
    'counterValue', 'remainingDisplay', 'todayCountDisplay', 'statToday',
    'statRosaries', 'statRemaining', 'progressBar', 'progressTrack',
    'percentageDisplay', 'statLastUpdated', 'recentActivityList',
    'targetReachedBanner', 'hailMaryInput', 'submitPrayersBtn',
    'submitBtnText', 'decrementInputBtn', 'incrementInputBtn',
    'toggleSoundBtn', 'soundIcon', 'soundLabel', 'shareWhatsAppBtn',
    'openPrayerModalBtn', 'openMysteriesBtn', 'mysteryDayHeading',
    'mysterySubHeading', 'currentDayBadge', 'mysteryListContainer',
    'toast', 'toastMsg', 'toastIcon'
  ];

  for (const id of requiredIndexIds) {
    assert.ok(
      indexHtml.includes(`id="${id}"`) || indexHtml.includes(`id='${id}'`),
      `Missing required ID in index.html: ${id}`
    );
  }
  console.log(`  ✅ All ${requiredIndexIds.length} frontend UI element IDs verified in index.html`);

  // 3. Admin DOM ID verification
  const adminHtml = fs.readFileSync('admin.html', 'utf8');
  const requiredAdminIds = [
    'loginScreen', 'loginUser', 'loginPass', 'loginError', 'loginBtn',
    'adminPanel', 'admTotal', 'admToday', 'admRemaining', 'overrideInput',
    'overrideReason', 'resetReason', 'historyTableBody', 'auditTableBody',
    'toast-admin'
  ];

  for (const id of requiredAdminIds) {
    assert.ok(
      adminHtml.includes(`id="${id}"`) || adminHtml.includes(`id='${id}'`),
      `Missing required ID in admin.html: ${id}`
    );
  }
  console.log(`  ✅ All ${requiredAdminIds.length} Admin control panel element IDs verified in admin.html`);

  // 4. Test Full User & Admin Flow
  console.log('\n--- Testing User Submission & Admin Management Flow ---');
  
  // Login as admin
  const loginRes = await fetch('http://localhost:8000/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'clcvelappaya2024' })
  });
  assert.strictEqual(loginRes.status, 200);
  const { token } = await loginRes.json();
  assert.ok(token);
  console.log('  ✅ Admin authenticated via session token');

  // Reset to known zero state for clean test
  await fetch('http://localhost:8000/api/admin/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
    body: JSON.stringify({ reason: 'E2E test setup' })
  });

  // Submit prayer as public user
  const userSub = await fetch('http://localhost:8000/api/prayers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 15 })
  });
  assert.strictEqual(userSub.status, 200);
  const subResult = await userSub.json();
  assert.strictEqual(subResult.submittedAmount, 15);
  assert.strictEqual(subResult.creditedAmount, 15);
  assert.strictEqual(subResult.totalCount, 15);
  console.log(`  ✅ Public prayer submitted (+15), total is now ${subResult.totalCount}`);

  // Fetch admin dashboard data
  const adminDataRes = await fetch('http://localhost:8000/api/admin/data', {
    headers: { 'X-Admin-Token': token }
  });
  assert.strictEqual(adminDataRes.status, 200);
  const adminData = await adminDataRes.json();
  assert.strictEqual(adminData.totalCount, 15);
  assert.ok(adminData.history.length > 0);
  console.log(`  ✅ Admin dashboard accurately reflects live total: ${adminData.totalCount}`);

  console.log('\n======================================================');
  console.log('  ALL E2E INTEGRATION & INTEGRITY TESTS PASSED!');
  console.log('======================================================\n');
}

testE2E().catch(err => {
  console.error('E2E Test Failed:', err);
  process.exit(1);
});
