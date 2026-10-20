/**
 * A token bucket: up to `burst` events at once, refilled at `perSec`.
 * Used to cap how fast one socket may send a given event (a misbehaving or
 * hostile client flooding signalling would otherwise cost every call on the
 * server).
 */
function createBucket({ perSec, burst }, now = Date.now) {
  let tokens = burst;
  let last = now();
  return {
    take() {
      const t = now();
      tokens = Math.min(burst, tokens + ((t - last) / 1000) * perSec);
      last = t;
      if (tokens >= 1) {
        tokens -= 1;
        return true;
      }
      return false;
    }
  };
}

module.exports = { createBucket };
