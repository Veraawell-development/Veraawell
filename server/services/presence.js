/**
 * Is the doctor actually here?
 *
 * `User.isOnline` is the doctor's own switch — "I'm taking instant requests".
 * It used to be the whole answer, and nothing ever turned it off except the
 * doctor: a doctor who closed the laptop stayed "Online now" in the directory
 * until they logged out, patients paid to ring someone who wasn't there, and a
 * server restart changed nothing. (Auto-offline had been removed outright
 * because it fired on every page refresh.)
 *
 * This keeps the switch and adds presence: a doctor counts as here while at
 * least one of their /data sockets is connected. When the last one goes, a
 * grace period starts — long enough for a refresh, a sleeping tab waking up or
 * a network blip — and only if nothing reconnects within it is the doctor
 * switched offline, through the same updateDoctorStatus a manual toggle uses
 * (so the directory hears about it the same way).
 *
 * In memory, on purpose: presence is a property of this process's sockets.
 * After a restart nobody is connected until they reconnect, which the boot
 * grace (startBootGrace) allows for before switching anyone off.
 */

const { createLogger } = require('../utils/logger');

const logger = createLogger('PRESENCE');

/** How long a doctor may be without a connection before going offline. */
const GRACE_MS = 2 * 60 * 1000;

const connections = new Map(); // doctorId -> Set(socketId)
const offlineTimers = new Map(); // doctorId -> Timeout

const short = (id) => String(id).substring(0, 8);

function goOffline(doctorId, io, reason) {
  const { updateDoctorStatus } = require('./doctorStatus.service');
  return updateDoctorStatus(doctorId, false, io)
    .then((user) => {
      if (user) logger.info('presence-offline', { doctorId: short(doctorId), reason });
    })
    .catch((err) => logger.warn('Could not switch an absent doctor offline', { doctorId: short(doctorId), error: err.message }));
}

/** A doctor's /data socket connected. Cancels a pending switch-off. */
function connected(doctorId, socketId) {
  const id = String(doctorId);
  const timer = offlineTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    offlineTimers.delete(id);
  }
  if (!connections.has(id)) connections.set(id, new Set());
  connections.get(id).add(socketId);
}

/**
 * A doctor's /data socket went away. If it was their last one, they go
 * offline after GRACE_MS unless a socket comes back first.
 */
function disconnected(doctorId, socketId, { io = null, graceMs = GRACE_MS } = {}) {
  const id = String(doctorId);
  const set = connections.get(id);
  if (!set) return;
  set.delete(socketId);
  if (set.size > 0) return;
  connections.delete(id);
  if (offlineTimers.has(id)) return;
  const timer = setTimeout(() => {
    offlineTimers.delete(id);
    if (!connections.has(id)) goOffline(id, io, 'no connection');
  }, graceMs);
  if (typeof timer.unref === 'function') timer.unref();
  offlineTimers.set(id, timer);
}

/** Does this doctor have a live connection right now? */
function isConnected(doctorId) {
  return connections.has(String(doctorId));
}

/**
 * After a restart: everyone marked online gets GRACE_MS to reconnect (their
 * dashboards do so within seconds); those who don't are switched off.
 *
 * @returns {Promise<number>} how many were switched off
 */
async function settleAfterBoot({ io = null } = {}) {
  const User = require('../models/user');
  const online = await User.find({ role: 'doctor', isOnline: true }).select('_id').lean();
  let switched = 0;
  for (const { _id } of online) {
    if (isConnected(_id)) continue;
    // eslint-disable-next-line no-await-in-loop
    await goOffline(_id, io, 'not back after a restart');
    switched += 1;
  }
  if (switched > 0) logger.info('Doctors switched offline after a restart', { count: switched });
  return switched;
}

/** Schedule settleAfterBoot once, GRACE_MS after the server starts. */
function startBootGrace({ io = null, graceMs = GRACE_MS } = {}) {
  const timer = setTimeout(() => {
    settleAfterBoot({ io }).catch((err) => logger.warn('Boot presence check failed', { error: err.message }));
  }, graceMs);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

/** Tests only: forget everything. */
function _reset() {
  for (const t of offlineTimers.values()) clearTimeout(t);
  offlineTimers.clear();
  connections.clear();
}

module.exports = { GRACE_MS, connected, disconnected, isConnected, settleAfterBoot, startBootGrace, _reset };
