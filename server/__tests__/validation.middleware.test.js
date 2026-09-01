const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { validateObjectIdParam, validateObjectIdBody, isValidObjectId } = require('../middleware/validation.middleware');
const { errorHandler } = require('../middleware/error.middleware');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.get('/sessions/:sessionId', validateObjectIdParam('sessionId'), (req, res) => res.json({ ok: true }));
  app.post('/sessions/book', validateObjectIdBody('doctorId'), (req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe('isValidObjectId', () => {
  test('accepts a real ObjectId string', () => {
    expect(isValidObjectId(new mongoose.Types.ObjectId().toString())).toBe(true);
  });
  test('rejects malformed strings', () => {
    expect(isValidObjectId('undefined')).toBe(false);
    expect(isValidObjectId('not-an-id')).toBe(false);
    expect(isValidObjectId('')).toBe(false);
  });
  test('rejects non-string values', () => {
    expect(isValidObjectId(undefined)).toBe(false);
    expect(isValidObjectId(null)).toBe(false);
    expect(isValidObjectId(123)).toBe(false);
  });
});

describe('validateObjectIdParam / validateObjectIdBody wired into routes', () => {
  test('a malformed :sessionId param is rejected with a clean 400, not a 500', async () => {
    const app = buildApp();
    const res = await request(app).get('/sessions/undefined');
    expect(res.status).toBe(400);
  });

  test('a well-formed :sessionId param passes through', async () => {
    const app = buildApp();
    const validId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/sessions/${validId}`);
    expect(res.status).toBe(200);
  });

  test('a missing doctorId body field on /book is rejected with a clean 400', async () => {
    const app = buildApp();
    const res = await request(app).post('/sessions/book').send({});
    expect(res.status).toBe(400);
  });

  test('a well-formed doctorId body field on /book passes through', async () => {
    const app = buildApp();
    const validId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).post('/sessions/book').send({ doctorId: validId });
    expect(res.status).toBe(200);
  });
});
