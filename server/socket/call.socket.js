/**
 * Call signalling — `call:*` events on the default namespace. Thin on
 * purpose: the logic is in services/call/callService.js. Every event has an
 * acknowledgement, a shape check and a rate limit (authz/socket.js registrar).
 */

const { createGuardedRegistrar } = require('../authz/socket');
const callService = require('../services/call/callService');
const payloads = require('../services/call/callPayloads');
const { createLogger } = require('../utils/logger');

const logger = createLogger('CALL-SOCKET');

const reply = (ack, value) => { if (typeof ack === 'function') ack(value); };

module.exports = (io) => {
  callService.init(io);

  io.on('connection', (socket) => {
    const { on } = createGuardedRegistrar(socket, { tag: 'CALL' });

    // A call page still open from before the new engine (it joins with the
    // first protocol's 'join-room'): tell it to refresh instead of leaving it
    // waiting for nobody.
    on('join-room', { mode: 'open' }, () => {
      socket.emit('error', { message: 'Veraawell has been updated. Please refresh this page to continue your call.' });
    });

    on('call:join', { mode: 'policy', action: 'session:join', validate: payloads.join, rate: { perSec: 0.5, burst: 5 } },
      async (payload, ctx) => {
        // Signals sent right behind this join wait for it (authz/socket.js).
        const joining = callService.join(socket, ctx.resource, payload);
        socket.data.joining = joining;
        try {
          reply(ctx.ack, await joining);
        } finally {
          if (socket.data.joining === joining) socket.data.joining = null;
        }
      });

    on('call:signal', { mode: 'joined', validate: payloads.signal, rate: { perSec: 50, burst: 200 } },
      (payload, ctx) => reply(ctx.ack, callService.signal(socket, payload)));

    on('call:media-state', { mode: 'joined', validate: payloads.mediaState, rate: { perSec: 10, burst: 20 } },
      (payload, ctx) => reply(ctx.ack, callService.mediaState(socket, payload)));

    on('call:media-health', { mode: 'joined', validate: payloads.mediaHealth, rate: { perSec: 0.2, burst: 3 } },
      (payload, ctx) => reply(ctx.ack, callService.mediaHealth(socket, payload)));

    on('call:prep-data', { mode: 'joined', partyRole: 'patient', validate: payloads.prepData, rate: { perSec: 0.1, burst: 5 } },
      (payload, ctx) => reply(ctx.ack, callService.prepData(socket, payload)));

    on('call:leave', { mode: 'joined', validate: payloads.leave, rate: { perSec: 1, burst: 5 } },
      async (payload, ctx) => reply(ctx.ack, await callService.leave(socket, payload)));

    on('disconnect', { mode: 'open' }, () => {
      try {
        callService.onDisconnect(socket);
      } catch (err) {
        logger.error('Call disconnect handling failed', { error: err.message });
      }
    });
  });
};
