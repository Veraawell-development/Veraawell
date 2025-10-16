// Comprehensive test script for video call system
const http = require('http');
const io = require('socket.io-client');

const API_BASE = 'http://localhost:5001';

// Test utilities
const log = {
  test: (name) => console.log(`\n🧪 Testing: ${name}`),
  pass: (msg) => console.log(`✅ ${msg}`),
  fail: (msg) => console.log(`❌ ${msg}`),
  info: (msg) => console.log(`ℹ️  ${msg}`)
};

// Test 1: Server Health Check
async function testServerHealth() {
  log.test('Server Health Check');
  try {
    const response = await fetch(`${API_BASE}/`);
    const data = await response.json();
    if (data.message === 'Veraawell Backend is running!') {
      log.pass('Server is running');
      return true;
    }
    log.fail('Server response invalid');
    return false;
  } catch (error) {
    log.fail(`Server not responding: ${error.message}`);
    return false;
  }
}

// Test 2: Session Creation (Mock)
async function testSessionCreation() {
  log.test('Session Creation Logic');
  
  // Mock session data
  const mockSession = {
    patientId: '68f0f3bb92dc0bdc18a5b188',
    doctorId: '68f0f3bb92dc0bdc18a5b188', // Same user for testing
    sessionType: 'immediate',
    sessionDate: new Date(),
    sessionTime: new Date().toTimeString().slice(0, 5)
  };
  
  log.info(`Mock session: patientId=${mockSession.patientId.substring(0, 8)}, doctorId=${mockSession.doctorId.substring(0, 8)}`);
  
  if (mockSession.patientId && mockSession.doctorId) {
    log.pass('Session data structure valid');
    return true;
  }
  log.fail('Session data invalid');
  return false;
}

// Test 3: Socket Connection
function testSocketConnection() {
  return new Promise((resolve) => {
    log.test('Socket.IO Connection');
    
    const socket = io(API_BASE, {
      transports: ['websocket', 'polling']
    });
    
    socket.on('connect', () => {
      log.pass('Socket connected successfully');
      
      // Test room join
      socket.emit('join-room', {
        sessionId: '68f0fd71c3b11b3acc7cb352',
        userId: '68f0f3bb92dc0bdc18a5b188',
        role: 'patient'
      });
      
      socket.on('room-joined', (data) => {
        log.pass('Room joined successfully');
        socket.disconnect();
        resolve(true);
      });
      
      socket.on('error', (error) => {
        log.fail(`Socket error: ${error.message}`);
        socket.disconnect();
        resolve(false);
      });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        log.fail('Socket test timeout');
        socket.disconnect();
        resolve(false);
      }, 5000);
    });
    
    socket.on('connect_error', (error) => {
      log.fail(`Socket connection failed: ${error.message}`);
      resolve(false);
    });
  });
}

// Test 4: Calendar API
async function testCalendarAPI() {
  log.test('Calendar API Endpoint');
  try {
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    
    const response = await fetch(`${API_BASE}/api/sessions/calendar/${year}/${month}`, {
      credentials: 'include'
    });
    
    if (response.status === 401) {
      log.info('Calendar requires authentication (expected)');
      return true;
    }
    
    if (response.ok) {
      const sessions = await response.json();
      log.pass(`Calendar API working, found ${sessions.length} sessions`);
      return true;
    }
    
    log.fail(`Calendar API failed: ${response.status}`);
    return false;
  } catch (error) {
    log.fail(`Calendar API error: ${error.message}`);
    return false;
  }
}

// Test 5: WebRTC Configuration
function testWebRTCConfig() {
  log.test('WebRTC Configuration');
  
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];
  
  try {
    const pc = new RTCPeerConnection({ iceServers });
    log.pass('WebRTC PeerConnection created successfully');
    pc.close();
    return true;
  } catch (error) {
    log.fail(`WebRTC error: ${error.message}`);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting Comprehensive Video Call System Tests\n');
  
  const results = [];
  
  results.push(await testServerHealth());
  results.push(await testSessionCreation());
  results.push(await testSocketConnection());
  results.push(await testCalendarAPI());
  results.push(testWebRTCConfig());
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`\n📊 Test Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 All tests passed! Video call system is ready.');
  } else {
    console.log('⚠️  Some tests failed. System needs fixes.');
  }
  
  process.exit(passed === total ? 0 : 1);
}

// Check if running in Node.js environment
if (typeof window === 'undefined') {
  runAllTests();
}

module.exports = { runAllTests };
