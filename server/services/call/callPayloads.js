/**
 * Shape checks for the call signalling events (socket/call.socket.js).
 *
 * Signalling payloads were relayed as received — any size, any shape — so one
 * client could push megabytes through the server to the other person, or
 * crash their peer connection with garbage. Each check returns an error
 * message, or null when the payload is acceptable.
 */

const MAX_SDP = 64 * 1024;
const MAX_CANDIDATE = 1024;
const ID = /^[a-f0-9]{24}$/i;
const CANDIDATE_TYPES = ['host', 'srflx', 'prflx', 'relay'];

const isStr = (v, max) => typeof v === 'string' && v.length <= max;
const optStr = (v, max) => v === undefined || v === null || isStr(v, max);
const isBool = (v) => typeof v === 'boolean';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function sessionIdError(p) {
  return p && typeof p.sessionId === 'string' && ID.test(p.sessionId) ? null : 'A valid sessionId is required';
}

function join(p) {
  const e = sessionIdError(p);
  if (e) return e;
  if (!isNum(p.protocol)) return 'protocol is required';
  if (!isStr(p.instanceId, 64) || !p.instanceId) return 'instanceId is required';
  if (p.client !== undefined) {
    const c = p.client;
    if (!c || typeof c !== 'object') return 'client must be an object';
    if (!optStr(c.browser, 60) || !optStr(c.os, 60) || !optStr(c.appVersion, 60)) return 'client fields are too long';
  }
  return null;
}

function signal(p) {
  const e = sessionIdError(p);
  if (e) return e;
  if (!isNum(p.epoch)) return 'epoch is required';
  const hasDescription = p.description !== undefined;
  const hasCandidate = p.candidate !== undefined;
  if (hasDescription === hasCandidate) return 'Send exactly one of description or candidate';
  if (hasDescription) {
    const d = p.description;
    if (!d || !['offer', 'answer', 'rollback', 'pranswer'].includes(d.type)) return 'description.type is invalid';
    if (d.type !== 'rollback' && !isStr(d.sdp, MAX_SDP)) return 'description.sdp is missing or too large';
    return null;
  }
  const c = p.candidate;
  if (c === null) return null; // end of candidates
  if (!c || typeof c !== 'object') return 'candidate must be an object or null';
  if (!isStr(c.candidate, MAX_CANDIDATE)) return 'candidate.candidate is missing or too large';
  if (!optStr(c.sdpMid, 32)) return 'candidate.sdpMid is invalid';
  if (!(c.sdpMLineIndex === undefined || c.sdpMLineIndex === null
        || (Number.isInteger(c.sdpMLineIndex) && c.sdpMLineIndex >= 0 && c.sdpMLineIndex <= 64))) {
    return 'candidate.sdpMLineIndex is invalid';
  }
  if (!optStr(c.usernameFragment, 64)) return 'candidate.usernameFragment is invalid';
  return null;
}

function mediaHealth(p) {
  const e = sessionIdError(p);
  if (e) return e;
  if (!isBool(p.audioFlowing) || !isBool(p.videoFlowing)) return 'audioFlowing and videoFlowing are required';
  if (!(p.candidateType === undefined || p.candidateType === null || CANDIDATE_TYPES.includes(p.candidateType))) return 'candidateType is invalid';
  if (!(p.rtt === undefined || p.rtt === null || (isNum(p.rtt) && p.rtt >= 0 && p.rtt < 60000))) return 'rtt is invalid';
  if (!(p.loss === undefined || p.loss === null || (isNum(p.loss) && p.loss >= 0 && p.loss <= 100))) return 'loss is invalid';
  if (!optStr(p.iceState, 20)) return 'iceState is invalid';
  return null;
}

function mediaState(p) {
  const e = sessionIdError(p);
  if (e) return e;
  return isBool(p.audio) && isBool(p.video) ? null : 'audio and video are required';
}

function prepData(p) {
  const e = sessionIdError(p);
  if (e) return e;
  if (!Array.isArray(p.tags) || p.tags.length > 20 || !p.tags.every((t) => isStr(t, 40))) return 'tags must be up to 20 short strings';
  return null;
}

function leave(p) {
  const e = sessionIdError(p);
  if (e) return e;
  return optStr(p.reason, 20) ? null : 'reason is invalid';
}

module.exports = { join, signal, mediaHealth, mediaState, prepData, leave, MAX_SDP, MAX_CANDIDATE };
