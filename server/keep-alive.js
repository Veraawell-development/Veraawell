/**
 * Keep-Alive Script for Render Free Tier
 * Pings the server every 14 minutes to prevent it from sleeping
 * Run this on a separate service (e.g., your local machine, another server, or cron-job.org)
 */

const https = require('https');

const BACKEND_URL = 'https://veraawell-backend.onrender.com/api/health';
const PING_INTERVAL = 14 * 60 * 1000; // 14 minutes in milliseconds

function pingServer() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Pinging server...`);
  
  https.get(BACKEND_URL, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log(`[${timestamp}] ✅ Server is awake! Response:`, data.substring(0, 100));
      } else {
        console.log(`[${timestamp}] ⚠️ Server responded with status ${res.statusCode}`);
      }
    });
  }).on('error', (err) => {
    console.error(`[${timestamp}] ❌ Error pinging server:`, err.message);
  });
}

// Ping immediately on start
console.log('🚀 Keep-Alive service started');
console.log(`📡 Will ping ${BACKEND_URL} every 14 minutes`);
pingServer();

// Then ping every 14 minutes
setInterval(pingServer, PING_INTERVAL);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Keep-Alive service stopped');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Keep-Alive service stopped');
  process.exit(0);
});
