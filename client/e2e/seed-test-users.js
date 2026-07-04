/**
 * Database Seeder for E2E Tests
 * Run this ONCE before running E2E tests to create test accounts in the database.
 *
 * Usage: node e2e/seed-test-users.js
 *
 * IMPORTANT: Backend must be running at http://localhost:5001
 */

import { execSync } from 'child_process';
import path from 'path';
const API_URL = 'http://localhost:5001/api';

const TEST_PATIENT = {
  firstName: 'E2E',
  lastName: 'Patient',
  email: 'e2e.patient@veerawell.test',
  username: 'e2e.patient@veerawell.test',
  password: 'TestPatient123!',
  phoneNo: '9000000001',
  role: 'patient',
};

const TEST_DOCTOR = {
  firstName: 'E2E',
  lastName: 'Doctor',
  email: 'e2e.doctor@veerawell.test',
  username: 'e2e.doctor@veerawell.test',
  password: 'TestDoctor123!',
  phoneNo: '9000000002',
  role: 'doctor',
  jobRole: 'Psychologist',
  specialization: 'Clinical Psychologist',
};

async function seedUser(userData) {
  console.log(`\n[SEED] Attempting to create ${userData.role}: ${userData.email}`);
  console.log(`[SEED] Payload:`, JSON.stringify(userData));

  // First try to log in (user might already exist)
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: userData.email, password: userData.password, role: userData.role }),
  });

  if (loginRes.ok) {
    console.log(`[SEED] ✅ User already exists and credentials work: ${userData.email}`);
    return;
  }

  const loginData = await loginRes.json().catch(() => ({}));
  console.log(`[SEED] Login failed (${loginRes.status}): ${loginData.message || 'no message'} — will try to register`);

  // Create user via register endpoint
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
  });

  const data = await res.json();

  if (res.ok) {
    console.log(`[SEED] ✅ Created ${userData.role}: ${userData.email}`);
  } else {
    console.error(`[SEED] ❌ Failed to create ${userData.email} [HTTP ${res.status}]:`, JSON.stringify(data));
  }
}

async function main() {
  console.log('[SEED] Starting E2E test user seeding...');
  console.log(`[SEED] Backend URL: ${API_URL}`);

  try {
    // Test if backend is reachable
    const healthRes = await fetch(`${API_URL}/health`).catch(() => null);
    if (!healthRes || !healthRes.ok) {
      console.error('[SEED] ❌ Backend is not reachable. Make sure server is running on port 5001.');
      process.exit(1);
    }

    await seedUser(TEST_PATIENT);
    await seedUser(TEST_DOCTOR);

    console.log('\n[SEED] Approving the doctor account so it can log in directly...');
    const serverScriptPath = path.resolve(process.cwd(), '../server/scripts/approve-e2e-doctor.js');
    execSync(`node "${serverScriptPath}"`, { stdio: 'inherit' });

    console.log('\n[SEED] ✅ Seeding complete. You can now run: npm run test:e2e');
  } catch (err) {
    console.error('[SEED] ❌ Unexpected error:', err.message);
    process.exit(1);
  }
}

main();
