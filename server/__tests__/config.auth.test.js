/**
 * config/auth.js: the secrets and cookie settings everything else signs with.
 */

describe('getSessionSecret', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    jest.resetModules();
  });

  test('without SESSION_SECRET in development, one ephemeral secret per process — not one per call', () => {
    // It signs the Google sign-in state cookie, which a later request checks.
    // A new random value per call made every local Google sign-in fail.
    process.env.NODE_ENV = 'development';
    process.env.SESSION_SECRET = '';
    let first;
    let second;
    jest.isolateModules(() => {
      const { getSessionSecret } = require('../config/auth');
      first = getSessionSecret();
      second = getSessionSecret();
    });
    expect(first).toMatch(/^[0-9a-f]{128}$/);
    expect(second).toBe(first);
  });

  test('a configured SESSION_SECRET is used as given', () => {
    process.env.SESSION_SECRET = 'configured-secret';
    jest.isolateModules(() => {
      expect(require('../config/auth').getSessionSecret()).toBe('configured-secret');
    });
  });

  test('production without SESSION_SECRET refuses to run', () => {
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = '';
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    try {
      jest.isolateModules(() => {
        expect(() => require('../config/auth').getSessionSecret()).toThrow('exit');
      });
      expect(exit).toHaveBeenCalledWith(1);
    } finally {
      exit.mockRestore();
    }
  });
});
