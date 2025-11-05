const fetch = require('node-fetch');

const API_BASE_URL = 'http://localhost:5001/api';

async function testCallHistory() {
  try {
    console.log('=== TESTING CALL HISTORY API ===\n');
    
    // Step 1: Login to get authentication cookie
    console.log('Step 1: Logging in...');
    const loginResponse = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'test@example.com', // Replace with actual test user
        password: 'test123',
        role: 'patient'
      })
    });

    let cookies = '';
    
    if (!loginResponse.ok) {
      const loginError = await loginResponse.json();
      console.log('Login failed:', loginError.message);
      console.log('Please use existing credentials or check the database');
      return;
    }

    // Extract cookies from login response
    cookies = loginResponse.headers.get('set-cookie') || '';
    const tokenMatch = cookies.match(/token=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : '';

    if (!token) {
      console.error('No authentication token received');
      return;
    }

    console.log('✓ Authentication successful\n');

    // Step 2: Fetch call history
    console.log('Step 2: Fetching call history...');
    const historyResponse = await fetch(`${API_BASE_URL}/sessions/call-history`, {
      headers: {
        'Cookie': `token=${token}`
      }
    });

    if (!historyResponse.ok) {
      const errorData = await historyResponse.json();
      console.error('Failed to fetch call history:', errorData);
      return;
    }

    const callHistory = await historyResponse.json();
    
    console.log('\n=== CALL HISTORY RESULTS ===');
    console.log(`Total calls found: ${callHistory.length}\n`);

    if (callHistory.length === 0) {
      console.log('No call history found.');
      console.log('\nThis could mean:');
      console.log('1. No sessions have been joined yet');
      console.log('2. All sessions are still in "not-started" state');
      console.log('3. The user has no sessions in the database');
    } else {
      callHistory.forEach((call, idx) => {
        console.log(`[${idx + 1}] ${call.name}`);
        console.log(`    Date: ${new Date(call.date).toLocaleDateString()}`);
        console.log(`    Duration: ${call.duration} minutes`);
        console.log(`    Mode: ${call.mode}`);
        console.log(`    Payment: Rs.${call.paymentAmount}`);
        console.log(`    Status: ${call.status}`);
        console.log(`    Call Status: ${call.callStatus || 'not-started'}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run the test
testCallHistory();
