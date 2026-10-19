/**
 * Video Socket Handler
 * Handles WebRTC signaling for video/audio calls.
 * Manages room creation, user join/leave, and call tracking.
 */
// Socket.IO handler for WebRTC video calling with comprehensive logging
const Session = require('../models/session');
const { createLogger } = require('../utils/logger');
const { createSocketAuthMiddleware } = require('./authMiddleware');
const { createGuardedRegistrar, grantRoom, revokeRoom } = require('../authz/socket');
const { tryTransition } = require('../services/sessionTransition');
const { EVENT, ACTOR, LIVE_STATUSES } = require('../services/sessionState');
const { isWithinJoinWindow, deriveFields, resolveEndsAt } = require('../services/sessionTime');
const { PLATFORM_TIMEZONE } = require('../config/time');
const policy = require('../services/sessionPolicy');
const sessionEnding = require('../services/sessionEnding');

/**
 * Finish a call whose booked minutes are used up. Through the transition
 * table, as every other completion is: the timer and the disconnect handler
 * both used to write `status = 'completed'` with a raw save() of a document
 * read before an await, and the disconnect path wrote `status = 'scheduled'`
 * for a short call — which revived sessions the sweep had already marked
 * no-show or that had been refunded, and demoted a live instant session.
 */
async function completeCall(sessionId, extraSet) {
  const result = await tryTransition(sessionId, {
    event: EVENT.COMPLETE,
    actor: ACTOR.SYSTEM,
    extraSet: { callStatus: 'completed', callEndTime: new Date(), ...extraSet }
  });
  return result;
}

const logger = createLogger('SOCKET-HANDLER');
const attendance = require('../services/attendance');

/** The user's side of the session; only the two parties can be in a room. */
const partyRole = (role) => (role === 'doctor' ? 'doctor' : 'patient');

const isInRoom = (room, userId) => !!room && Array.from(room.users.values()).some((u) => u.userId === userId);
const uniqueUserCount = (room) => new Set(Array.from(room.users.values()).map((u) => u.userId)).size;

/**
 * Close this user's attendance stay if this was their last socket in the
 * room (a second tab keeps them in). Never throws: attendance must not break
 * the socket's own cleanup.
 */
async function recordLeaveIfGone(io, room, sessionId, userId, role) {
  try {
    if (!isInRoom(room, userId)) await attendance.recordLeave(sessionId, partyRole(role), { source: 'socket', io });
  } catch (err) {
    logger.error('Could not record leaving the call', { sessionId: String(sessionId).substring(0, 8), error: err.message });
  }
}

// Store active rooms and users.
//
// roomId -> { users: Map<socketId, {userId, role}>, createdAt, clock, endsAt, pendingAccept }
//
// Nothing here has to survive a restart. The clock used to be a countdown
// held only in this map — `remainingSeconds`, decremented while both people
// were in — so a deploy mid-call gave everyone a fresh full timer, and a call
// whose people kept dropping ran past its end. The end is now a time stored
// on the session (effectiveEndsAt, services/attendance.js); this map only
// remembers which sockets are in which call.
const activeRooms = new Map();
const userSockets = new Map(); // userId -> socketId

/** How often the room re-reads the session's end time (a late doctor moves it). */
const TIMING_REFRESH_TICKS = 15;

// JWT verification middleware for Socket.IO — see socket/authMiddleware.js
const authenticateSocket = createSocketAuthMiddleware('VIDEO-AUTH');

// Use existing logger
const log = logger;

/** v1 sockets currently in a call room (call v2 tells them to refresh). */
function v1SocketsInRoom(sessionId) {
  const room = activeRooms.get(String(sessionId));
  return room ? Array.from(room.users.keys()) : [];
}

/** Is someone of this role in a v1 call room (boot settle must not close their stay). */
function v1IsPresent(sessionId, role) {
  const room = activeRooms.get(String(sessionId));
  return !!room && Array.from(room.users.values()).some((u) => (u.role === 'doctor' ? 'doctor' : 'patient') === role);
}

module.exports = (io, { authAlready = false } = {}) => {
  if (!authAlready) io.use(authenticateSocket);

  /**
   * Re-read when this call ends. The stored effectiveEndsAt (the booked end,
   * or later when the doctor's first join was late) or the booked end. An
   * instant request nobody has accepted yet has no end: its start is reset to
   * the moment of accepting.
   */
  async function refreshRoomTiming(sessionId) {
    const room = activeRooms.get(sessionId);
    if (!room) return;
    const s = await Session.findById(sessionId)
      .select('effectiveEndsAt endsAt startsAt duration timezone sessionDate sessionTime sessionType acceptanceStatus status')
      .lean();
    if (!s) return;
    room.endsAt = s.effectiveEndsAt ? new Date(s.effectiveEndsAt) : resolveEndsAt(s);
    room.pendingAccept = s.sessionType === 'immediate' && s.acceptanceStatus !== 'accepted';
  }

  /**
   * What the call screen shows. `endsAt` + `serverNow` is what current apps
   * count down from (so a skewed device clock doesn't matter);
   * `remainingSeconds` is kept for apps still open from before this change.
   */
  function timerPayload(room, now = new Date()) {
    return {
      endsAt: room.endsAt,
      serverNow: now,
      remainingSeconds: Math.max(0, Math.round((room.endsAt.getTime() - now.getTime()) / 1000))
    };
  }

  /**
   * The booked time is over. Completed if both people were in the call at
   * some point; otherwise the end-of-session sweep decides (a no-show).
   */
  async function onTimeUp(sessionId) {
    try {
      const s = await Session.findById(sessionId)
        .select('status attendance doctorJoined doctorJoinedAt patientJoined patientJoinedAt startsAt endsAt duration timezone sessionDate sessionTime');
      if (s && LIVE_STATUSES.includes(s.status) && s.doctorJoined && s.patientJoined) {
        const result = await completeCall(sessionId, { actualDuration: policy.minutesTogether(s, new Date()) });
        log.info('Session completed: its time is up', { sessionId: sessionId.substring(0, 8), changed: result.changed });
        if (result.changed) await sessionEnding.sendCompletionSummary(sessionId);
      }
    } catch (err) {
      log.error('Failed to complete a session whose time is up', { error: err.message });
    }
    io.to(sessionId).emit('session-time-up');
  }

  /** One clock per room, counting down to the stored end — never a stored countdown. */
  function startClock(sessionId) {
    const room = activeRooms.get(sessionId);
    if (!room || room.clock) return;
    let ticks = 0;
    room.clock = setInterval(async () => {
      const current = activeRooms.get(sessionId);
      if (!current) return;
      ticks += 1;
      if (ticks % TIMING_REFRESH_TICKS === 0) {
        try { await refreshRoomTiming(sessionId); } catch (err) { log.warn('Could not refresh call timing', { error: err.message }); }
      }
      if (current.pendingAccept || !current.endsAt) return;
      const now = new Date();
      io.to(sessionId).emit('timer-sync', timerPayload(current, now));
      if (now >= current.endsAt) {
        clearInterval(current.clock);
        current.clock = null;
        await onTimeUp(sessionId);
      }
    }, 1000);
  }

  /** Stop counting and note where the call got to; the session stays joinable. */
  async function closeRoom(sessionId) {
    const room = activeRooms.get(sessionId);
    if (room && room.clock) clearInterval(room.clock);
    activeRooms.delete(sessionId);
    try {
      const s = await Session.findById(sessionId)
        .select('callStatus attendance doctorJoinedAt patientJoinedAt doctorJoined patientJoined startsAt endsAt duration timezone sessionDate sessionTime')
        .lean();
      // Someone may have rejoined while this was reading.
      if (s && s.callStatus === 'in-progress' && !activeRooms.has(sessionId)) {
        const now = new Date();
        await Session.updateOne(
          { _id: sessionId, status: { $in: LIVE_STATUSES }, callStatus: 'in-progress' },
          { $set: { callStatus: 'paused', callEndTime: now, actualDuration: policy.minutesTogether(s, now) } }
        );
      }
    } catch (error) {
      log.error('Failed to update call tracking', { error: error.message });
    }
    log.info('Room closed (empty)', { sessionId: String(sessionId).substring(0, 8) });
  }

  /**
   * A socket left the call: its tab closed, it pressed Leave, or the network
   * dropped. Leaving never ends or completes the session — only time running
   * out or both people agreeing does — so this records the departure, tells
   * the other person once the user's LAST tab has gone, and closes the room
   * when it is empty. Idempotent: a socket already gone is a no-op.
   */
  async function departRoom(socket, sessionId) {
    const room = activeRooms.get(sessionId);
    if (!room || !room.users.has(socket.id)) return false;
    const { userId, role } = room.users.get(socket.id);
    room.users.delete(socket.id);
    await recordLeaveIfGone(io, room, sessionId, userId, role);
    if (!isInRoom(room, userId)) {
      socket.to(sessionId).emit('user-left', { userId, role });
    }
    log.info('User socket left room', { socketId: socket.id, userId, role, sessionId: String(sessionId).substring(0, 8) });
    if (room.users.size === 0) await closeRoom(sessionId);
    return true;
  }

  io.on('connection', (socket) => {
    const { id: userId, role, username } = socket.user || {};
    log.info('New socket connection', { socketId: socket.id, userId, role });

    // Every handler below is registered through this, which enforces the
    // policy declared in its spec. See authz/socket.js — 13 of these events
    // previously had no authorization at all and acted on whatever sessionId
    // the client sent.
    const { on } = createGuardedRegistrar(socket, { tag: 'VIDEO' });

    // Handle disconnection
    on('disconnect', { mode: 'open' }, async () => {
      log.info('User disconnected', { userId, role, sessionId: socket.roomId });
      if (socket.roomId) {
        await departRoom(socket, socket.roomId);
        revokeRoom(socket, socket.roomId);
      }
      userSockets.delete(userId);
    });

    // Join video call room
    on('join-room', { mode: 'policy', action: 'session:join' }, async ({ sessionId }, ctx) => {
      try {
        log.info('User joining room', { userId, role, sessionId });

        // Identity and participation are enforced by the registrar via the
        // 'session:join' policy, which also loaded the record. The
        // hand-written party comparison that used to live here — including a
        // self-session bypass for immediate sessions — is gone; `ctx.resource`
        // is the authorized Session.
        const session = ctx.resource;
        // The other person is on the new call engine: this old page can't
        // talk to it.
        if (require('../services/call/callService').hasRoom(sessionId)) {
          socket.emit('error', { message: 'Veraawell has been updated. Please refresh this page to join your session.' });
          return;
        }
        const isPatient = String(session.patientId) === userId;
        const isDoctor = String(session.doctorId) === userId;

        // A session that hasn't actually been paid for (or explicitly marked
        // not_required, e.g. a free/mock session) must not be joinable — the
        // call itself is the paid product, not just booking the slot.
        if (!['paid', 'not_required'].includes(session.paymentStatus)) {
          log.error('Join attempt on unpaid session', {
            userId: userId.substring(0, 8),
            sessionId: sessionId.substring(0, 8),
            paymentStatus: session.paymentStatus
          });
          socket.emit('error', { message: 'This session has not been paid for yet.' });
          return;
        }

        // Only a live session can be joined, and a booked one only inside
        // its window — the same rule GET /join/:id applies. The socket did
        // not check either, so a cancelled, completed or no-show session (or
        // one next week) could be opened straight from its URL.
        if (!LIVE_STATUSES.includes(session.status)) {
          socket.emit('error', { message: `This session is ${session.status} and can no longer be joined.` });
          return;
        }
        if (session.sessionType !== 'immediate' && !isWithinJoinWindow(session)) {
          socket.emit('error', { message: 'This session can be joined from 15 minutes before its start time.' });
          return;
        }

        log.info('User authorized for video call', {
          userId: userId.substring(0, 8),
          role: isPatient ? 'patient' : (isDoctor ? 'doctor' : 'self-session'),
          sessionType: session.sessionType
        });

        // Update call tracking - mark call as started or resumed, and record which
        // side (doctor/patient) has actually joined so no-show detection is accurate.
        //
        // Written as a targeted $set rather than session.save(). A full-document
        // save rewrites status and paymentStatus from this snapshot, which was
        // read before the await above — so a refund or a sweep transition
        // landing in between would be silently reverted by someone merely
        // joining the call.
        const set = {};
        if (!session.callStatus || session.callStatus === 'not-started' || session.callStatus === 'paused') {
          set.callStatus = 'in-progress';
          set.callStartTime = new Date();
        }
        // doctorJoined / patientJoined and their first-join times are written
        // by the attendance service below, together with the stay itself.

        // Joining IS accepting.
        //
        // acceptanceStatus used to be changed only by the Accept button on the
        // incoming-request popup. A doctor who instead opened the call link —
        // from the email, from their dashboard, or after the popup was missed
        // entirely — stayed 'pending' forever, and the unanswered-request
        // sweep then cancelled and refunded the session out from under a
        // conversation that was actively happening. Being in the room is the
        // strongest evidence of acceptance there is.
        // `!== 'accepted'` rather than `=== 'pending'`: a doctor who asked for
        // a few more minutes has acceptanceStatus 'delayed', and joining from
        // the "Patient Waiting" banner does not call /accept — it just
        // navigates. Matching only 'pending' left those sessions delayed
        // forever, so the banner came back on every dashboard remount long
        // after the call had happened.
        //
        // Same compare-and-set as POST /accept: only a request that is still
        // waiting can be accepted, so a doctor opening the link a moment after
        // the expiry sweep cancelled and refunded it is told so, rather than
        // being let into a call nobody is paying for.
        if (isDoctor && session.sessionType === 'immediate' && session.acceptanceStatus !== 'accepted') {
          const now = new Date();
          const accepted = await Session.findOneAndUpdate(
            { _id: session._id, status: 'active', acceptanceStatus: { $in: ['pending', 'delayed'] } },
            {
              $set: {
                acceptanceStatus: 'accepted',
                acceptanceDeadline: null,
                ...deriveFields(now, session.duration || 20, session.timezone || PLATFORM_TIMEZONE)
              }
            },
            { new: true }
          );
          if (!accepted) {
            socket.emit('error', { message: 'This request is no longer waiting — it was withdrawn or has expired.' });
            return;
          }
          log.info('Instant session accepted by the doctor joining the room', {
            sessionId: sessionId.substring(0, 8)
          });
        }

        if (Object.keys(set).length > 0) {
          // Conditional on the session still being live: the read above was
          // before at least one await.
          await Session.updateOne({ _id: session._id, status: { $in: LIVE_STATUSES } }, { $set: set });
          Object.assign(session, set);
          log.info('Call/join state updated', { sessionId: sessionId.substring(0, 8), isDoctor, isPatient });
        }

        // Who is in the call, and since when (services/attendance.js) — what
        // the lateness and no-show rules read. After the instant-request
        // accept above, so a doctor joining to accept is on time by
        // definition (the session starts at the accept).
        await attendance.recordJoin(session._id, isDoctor ? 'doctor' : 'patient', { source: 'socket', io });
        if (isDoctor) session.doctorJoined = true;
        if (isPatient) session.patientJoined = true;

        // Leave any other call this socket was in.
        if (socket.roomId && socket.roomId !== sessionId) {
          const previous = socket.roomId;
          await departRoom(socket, previous);
          revokeRoom(socket, previous);
          socket.leave(previous);
          log.info('User left previous room', { userId, role, sessionId: previous });
        }

        // Join the new room. grantRoom is what subsequently authorizes the
        // high-frequency signaling events (offer/answer/ice-candidate/
        // media-state-change): they check membership of this server-side set
        // instead of re-reading the Session on every ICE candidate.
        grantRoom(socket, sessionId);
        socket.join(sessionId);
        socket.roomId = sessionId;
        userSockets.set(userId, socket.id);

        if (!activeRooms.has(sessionId)) {
          activeRooms.set(sessionId, {
            users: new Map(),
            createdAt: new Date(),
            clock: null,
            endsAt: null,
            pendingAccept: false
          });
        }
        const room = activeRooms.get(sessionId);
        room.users.set(socket.id, { userId, role });
        const uniqueUsers = uniqueUserCount(room);
        // In the room and counting before the next await, so a departure
        // closing the room at this moment cannot leave us in one without a
        // clock. The clock waits for the end time read below.
        startClock(sessionId);

        // This join may have moved the end (a late doctor's first join), and
        // an instant session's start is reset when it is accepted: read the
        // end afresh and tell everyone in the room.
        await refreshRoomTiming(sessionId);
        if (!room.pendingAccept && room.endsAt) {
          io.to(sessionId).emit('timer-sync', timerPayload(room));
        }

        log.info(`${role.toUpperCase()} socket joined room`, {
          sessionId: sessionId.substring(0, 8),
          userId: userId.substring(0, 8),
          socketId: socket.id.substring(0, 8),
          uniqueUsers,
          endsAt: room.endsAt
        });

        // Notify the user about successful room join
        socket.emit('room-joined', {
          sessionId,
          userId,
          role,
          otherUsers: Array.from(new Set(Array.from(room.users.values()).map(u => u.userId)))
            .filter(id => id !== userId)
            .map(id => {
              const u = Array.from(room.users.values()).find(user => user.userId === id);
              return { userId: id, role: u?.role };
            }),
          userCount: uniqueUsers,
          timestamp: new Date().toISOString()
        });

        // Notify others in the room
        socket.to(sessionId).emit('user-joined', {
          userId,
          role,
          timestamp: new Date().toISOString()
        });

        log.info(`Active unique users in room ${sessionId.substring(0, 8)}:`, {
          count: uniqueUsers,
          users: Array.from(new Set(Array.from(room.users.values()).map(u => u.userId))).map(id => id.substring(0, 8))
        });

      } catch (error) {
        log.error('Error joining room', { error: error.message, sessionId });
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // Ending early takes both people (services/sessionEnding.js). These are
    // the socket forms of POST /:id/end-request and /end-response, kept so
    // an app still open from before that change gets the same rules.
    const roleIn = (session) => (String(session.doctorId) === userId ? 'doctor' : 'patient');
    const endingFailed = (err) => socket.emit('end-session-error', { message: err.message || 'Could not end the session.' });

    on('request-end-session', { mode: 'policy', action: 'session:end-call' }, async ({ sessionId }, ctx) => {
      try {
        await sessionEnding.requestEnd(sessionId, roleIn(ctx.resource), { io, except: socket.id });
      } catch (err) {
        endingFailed(err);
      }
    });

    on('confirm-end-session', { mode: 'policy', action: 'session:end-call' }, async ({ sessionId, agree }, ctx) => {
      try {
        await sessionEnding.respondToEnd(sessionId, roleIn(ctx.resource), !!agree, { io, except: socket.id });
      } catch (err) {
        endingFailed(err);
      }
    });

    /**
     * "I'm leaving the call." Older apps send this from their End button and
     * after the other side hangs up.
     *
     * It used to complete the session — through the transition table, but
     * on the say-so of one person. Pressing End a minute in, alone, finished
     * the session: the doctor was paid and the patient lost it; and it was
     * relayed to the other side, whose app then asked the server to complete
     * it too. Now it is only a departure: nothing is relayed beyond the usual
     * `user-left`, and the session stays joinable until its time is up.
     */
    on('call-ended', { mode: 'policy', action: 'session:end-call' }, async ({ sessionId }) => {
      log.info('Call left via call-ended', { userId, role, sessionId: String(sessionId).substring(0, 8) });
      await departRoom(socket, sessionId);
    });

    on('leave-room', { mode: 'joined' }, async ({ sessionId }) => {
      log.info('User leaving room manually', { userId, role, sessionId });
      await departRoom(socket, sessionId);
      revokeRoom(socket, sessionId);
      socket.leave(sessionId);
      socket.roomId = null;
    });

    on('patient-ready', { mode: 'joined' }, ({ sessionId }) => {
      log.info('Patient ready signal received', { sessionId: sessionId.substring(0, 8) });
      socket.to(sessionId).emit('patient-ready');
    });

    on('patient-prep-data', { mode: 'joined' }, ({ sessionId, tags }) => {
      log.info('Patient prep data received', { sessionId: sessionId.substring(0, 8), tags });
      socket.to(sessionId).emit('patient-prep-data', { tags });
    });

    on('offer', { mode: 'joined' }, ({ sessionId, offer, targetUserId }) => {
      log.info('Offer received', {
        sessionId: sessionId.substring(0, 8),
        from: socket.id.substring(0, 8),
        to: targetUserId?.substring(0, 8)
      });

      socket.to(sessionId).emit('offer', {
        offer,
        senderId: socket.id
      });
    });

    // WebRTC Signaling: Send answer
    on('answer', { mode: 'joined' }, ({ sessionId, answer, targetUserId }) => {
      log.info('Answer received', {
        sessionId: sessionId.substring(0, 8),
        from: socket.id.substring(0, 8),
        to: targetUserId?.substring(0, 8)
      });

      socket.to(sessionId).emit('answer', {
        answer,
        senderId: socket.id
      });
    });

    // WebRTC Signaling: ICE candidate
    on('ice-candidate', { mode: 'joined' }, ({ sessionId, candidate }) => {
      log.info('ICE candidate received', {
        sessionId: sessionId.substring(0, 8),
        from: socket.id.substring(0, 8)
      });

      socket.to(sessionId).emit('ice-candidate', {
        candidate,
        senderId: socket.id
      });
    });

    // Media state change (mute/unmute, video on/off)
    on('media-state-change', { mode: 'joined' }, ({ sessionId, video, audio }) => {
      log.info('Media state change', {
        sessionId: sessionId.substring(0, 8),
        userId: userId.substring(0, 8),
        video,
        audio
      });
      
      // Broadcast media state to other users in the room
      socket.to(sessionId).emit('media-state-change', {
        userId,
        video,
        audio
      });
    });

    // Note: leave-room is handled once, above — it used to be registered a second
    // time here with a userId-keyed lookup that never matched (room.users is keyed
    // by socket.id), causing a duplicate 'user-left' broadcast on every leave.
    // Note: Main disconnect handler is above (lines 73-118)
  });

  // Log active rooms every 30 seconds
  setInterval(() => {
    if (activeRooms.size > 0) {
      log.info('Active video call rooms', {
        totalRooms: activeRooms.size,
        rooms: Array.from(activeRooms.entries()).map(([id, room]) => ({
          sessionId: id.substring(0, 8),
          users: room.users.size,
          duration: Math.floor((Date.now() - room.createdAt) / 1000) + 's'
        }))
      });
    }
  }, 30000);
};

module.exports.v1SocketsInRoom = v1SocketsInRoom;
module.exports.v1IsPresent = v1IsPresent;
