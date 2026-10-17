/**
 * The global error handler, branch by branch.
 *
 * Several of these branches were only reached by accident — a duplicate-key
 * error, for instance, appears only when a concurrency test happens to race a
 * particular way — so this file's coverage moved from run to run and failed the
 * per-file ratchet in CI with no code change. Exercising every branch directly
 * makes the number, and the behaviour, deterministic.
 */

const { errorHandler, notFoundHandler, asyncHandler } = require('../middleware/error.middleware');
const { AppError } = require('../utils/errors');

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

const req = { originalUrl: '/api/x', method: 'POST', ip: '127.0.0.1' };

function handle(err) {
  const res = mockRes();
  errorHandler(err, req, res, jest.fn());
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
}

describe('errorHandler', () => {
  const prevEnv = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = prevEnv; });

  test('an AppError keeps its status and passes code, category and errors through', () => {
    const err = new AppError('Nope', 403);
    err.code = 'AUTHZ_FORBIDDEN';
    err.category = 'authz';
    err.errors = { field: 'bad' };
    const { status, body } = handle(err);
    expect(status).toBe(403);
    expect(body).toEqual({ success: false, message: 'Nope', code: 'AUTHZ_FORBIDDEN', category: 'authz', errors: { field: 'bad' } });
  });

  test('an AppError without extras sends only the message', () => {
    const { body } = handle(new AppError('Plain', 400));
    expect(body).toEqual({ success: false, message: 'Plain' });
  });

  test('an invalid JWT is a 401', () => {
    const err = new Error('jwt malformed');
    err.name = 'JsonWebTokenError';
    expect(handle(err)).toEqual({ status: 401, body: { success: false, message: 'Invalid token' } });
  });

  test('an expired JWT is a 401 that says so', () => {
    const err = new Error('jwt expired');
    err.name = 'TokenExpiredError';
    expect(handle(err)).toEqual({ status: 401, body: { success: false, message: 'Token expired' } });
  });

  test('a Mongoose validation error is a 400 with the field errors', () => {
    const err = new Error('bad');
    err.name = 'ValidationError';
    err.errors = { email: { message: 'required' } };
    const { status, body } = handle(err);
    expect(status).toBe(400);
    expect(body.errors).toEqual(err.errors);
  });

  test('a duplicate key is a 409 naming the field', () => {
    const err = new Error('E11000');
    err.code = 11000;
    err.keyPattern = { email: 1 };
    expect(handle(err)).toEqual({ status: 409, body: { success: false, message: 'email already exists' } });
  });

  test('outside production an unknown error carries its message and stack', () => {
    process.env.NODE_ENV = 'development';
    const { status, body } = handle(new Error('boom'));
    expect(status).toBe(500);
    expect(body.message).toBe('boom');
    expect(body.stack).toBeDefined();
  });

  test('in production an unknown error says nothing about its cause', () => {
    process.env.NODE_ENV = 'production';
    const { status, body } = handle(new Error('db password is hunter2'));
    expect(status).toBe(500);
    expect(body).toEqual({ success: false, message: 'Internal server error' });
  });

  test('in production a non-500 status keeps its message', () => {
    process.env.NODE_ENV = 'production';
    const err = new Error('Payload too large');
    err.statusCode = 413;
    expect(handle(err)).toEqual({ status: 413, body: { success: false, message: 'Payload too large' } });
  });
});

describe('notFoundHandler and asyncHandler', () => {
  test('an unknown route is a 404 naming it', () => {
    const res = mockRes();
    notFoundHandler({ originalUrl: '/api/missing' }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].message).toMatch('/api/missing');
  });

  test('a rejected async handler is passed to next', async () => {
    const next = jest.fn();
    const err = new Error('async failure');
    await asyncHandler(async () => { throw err; })({}, {}, next);
    expect(next).toHaveBeenCalledWith(err);
  });
});
