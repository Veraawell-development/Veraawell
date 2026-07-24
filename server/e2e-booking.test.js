const axios = require('axios');
const io = require('socket.io-client');
const mongoose = require('mongoose');
const crypto = require('crypto');
require('dotenv').config({ path: './.env' });
const Session = require('./models/session');

const API_URL = 'http://localhost:5001/api';
const SOCKET_URL = 'http://localhost:5001/data';

async function runE2ETest() {
  console.log('--- STARTING E2E TEST ---');
  
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to DB for assertions.');

  // 1. Get a test patient and test doctor
  const patient = await mongoose.connection.db.collection('users').findOne({ role: 'patient' });
  const doctor = await mongoose.connection.db.collection('users').findOne({ role: 'doctor' });
  
  if (!patient || !doctor) {
    console.error('Missing test users');
    process.exit(1);
  }

  console.log(`Using Patient: ${patient._id}, Doctor: ${doctor._id}`);

  // Mock Tokens
  const jwt = require('jsonwebtoken');
  const patientToken = jwt.sign({ userId: patient._id.toString(), role: 'patient' }, process.env.JWT_SECRET);
  const doctorToken = jwt.sign({ userId: doctor._id.toString(), role: 'doctor' }, process.env.JWT_SECRET);

  // 2. Connect Doctor Socket
  console.log('Connecting Doctor Socket...');
  const doctorSocket = io(SOCKET_URL, {
    auth: { token: doctorToken }
  });

  await new Promise((resolve) => doctorSocket.on('connect', resolve));
  console.log('Doctor Socket Connected!');

  let socketEventReceived = false;
  doctorSocket.on('session:booked', (data) => {
    console.log('✅ DOCTOR RECEIVED SOCKET EVENT session:booked');
    console.log('Event Data:', { sessionId: data.sessionId });
    socketEventReceived = true;
  });

  // 3. Book Immediate Session (Patient)
  console.log('\nBooking Immediate Session via API...');
  const bookRes = await axios.post(`${API_URL}/sessions/book-immediate`, {
    doctorId: doctor._id.toString(),
    duration: 20,
    price: 500,
    mode: 'video'
  }, {
    headers: { Authorization: `Bearer ${patientToken}` }
  });

  const sessionData = bookRes.data.session;
  console.log(`Session Created: ${sessionData._id}, Razorpay Order: ${sessionData.razorpayOrderId}`);

  // 4. Simulate Webhook (Race Condition)
  console.log('\nSimulating Razorpay Webhook...');
  const webhookPayload = {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: `pay_mock_${Date.now()}`,
          order_id: sessionData.razorpayOrderId
        }
      }
    }
  };

  const webhookSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET)
    .update(JSON.stringify(webhookPayload))
    .digest('hex');

  await axios.post(`${API_URL}/payments/webhook`, webhookPayload, {
    headers: { 'x-razorpay-signature': webhookSignature }
  });
  console.log('Webhook Processed Successfully.');

  // 5. Simulate Frontend Verify Payment (Race Condition)
  console.log('\nSimulating Frontend /payments/verify...');
  const verifyRes = await axios.post(`${API_URL}/payments/verify`, {
    razorpay_order_id: sessionData.razorpayOrderId,
    razorpay_payment_id: webhookPayload.payload.payment.entity.id,
    razorpay_signature: crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(sessionData.razorpayOrderId + '|' + webhookPayload.payload.payment.entity.id)
      .digest('hex')
  }, {
    headers: { Authorization: `Bearer ${patientToken}` }
  });

  console.log('/verify Response:', verifyRes.data.message);

  // 6. Wait for socket propagation
  console.log('\nWaiting 2 seconds for sockets...');
  await new Promise(r => setTimeout(r, 2000));

  // 7. Assertions
  console.log('\n--- ASSERTIONS ---');
  const finalSession = await Session.findById(sessionData._id);
  
  console.log(`Expected status: 'active'. Actual: '${finalSession.status}'`);
  if (finalSession.status === 'active') console.log('✅ Status Assertion Passed');
  else console.error('❌ Status Assertion Failed');

  console.log(`Expected paymentStatus: 'paid'. Actual: '${finalSession.paymentStatus}'`);
  if (finalSession.paymentStatus === 'paid') console.log('✅ Payment Status Assertion Passed');
  else console.error('❌ Payment Status Assertion Failed');

  console.log(`Expected Socket Event: true. Actual: ${socketEventReceived}`);
  if (socketEventReceived) console.log('✅ Socket Assertion Passed');
  else console.error('❌ Socket Assertion Failed');

  // Cleanup
  doctorSocket.disconnect();
  await mongoose.disconnect();
  console.log('\n--- E2E TEST COMPLETE ---');
}

runE2ETest().catch(console.error);
