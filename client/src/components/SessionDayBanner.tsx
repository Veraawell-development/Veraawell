import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Session } from '../types';
import { canJoinNow, joinWindow } from '../utils/sessionRules';
import { formatSessionClock } from '../utils/dateUtils';
import EmergencyContactModal from './EmergencyContactModal';

/**
 * On the day of a session, at the top of the patient's dashboard (on a phone
 * the "Up next" card sits far below the fold): when it starts, when they can
 * join, a live countdown, the Join button the moment it opens, and the two
 * things that commonly hold a patient up at the door — no emergency contact
 * saved, and a camera/mic that isn't allowed (checked on the call's own
 * pre-join screen).
 */

const MINUTE = 60_000;

function countdown(ms: number): string {
  if (ms <= 0) return 'now';
  const mins = Math.ceil(ms / MINUTE);
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `in ${h} h ${m} min` : `in ${h} h`;
}

interface Props {
  session: Session & { callMode?: string; doctorId?: { firstName?: string; lastName?: string } | string | null };
  hasEmergencyContact: boolean;
}

const SessionDayBanner: React.FC<Props> = ({ session, hasEmergencyContact }) => {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());
  const [askContact, setAskContact] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const window_ = joinWindow(session);
  const startsAt = session.startsAt ? new Date(session.startsAt) : new Date(new Date(window_.opensAt).getTime() + 15 * MINUTE);
  if (session.sessionType === 'immediate') return null; // instant sessions have their own card
  // Only on the day: from 12 hours before until the session can no longer be joined.
  if (startsAt.getTime() - now > 12 * 60 * MINUTE || new Date(window_.closesAt).getTime() < now) return null;

  const open = canJoinNow(session, new Date(now));
  const doctor = session.doctorId && typeof session.doctorId === 'object'
    ? `Dr. ${[session.doctorId.firstName, session.doctorId.lastName].filter(Boolean).join(' ')}`.trim()
    : 'your therapist';
  const voice = session.callMode === 'Voice Calling';
  const started = startsAt.getTime() <= now;

  return (
    <section
      aria-label="Your session today"
      className="relative z-10 mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-11 pt-3"
    >
      <div className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 to-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4 shadow-sm">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-teal-700">
            {open ? (started ? 'Your session is on now' : 'Your session is open') : 'Your session today'}
          </p>
          <p className="mt-1 text-base sm:text-lg font-semibold text-gray-900">
            {voice ? 'Voice' : 'Video'} session with {doctor} · {formatSessionClock(startsAt, 'en-US')} IST
            <span className="text-gray-500 font-normal"> — {started ? 'started' : `starts ${countdown(startsAt.getTime() - now)}`}</span>
          </p>
          {!open && (
            <p className="mt-1 text-sm text-gray-600">
              You can join from {formatSessionClock(new Date(window_.opensAt), 'en-US')} IST (15 minutes before).
            </p>
          )}
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className={hasEmergencyContact ? 'text-emerald-600' : 'text-amber-600'}>{hasEmergencyContact ? '✓' : '!'}</span>
              {hasEmergencyContact ? 'Emergency contact saved' : (
                // Asked right here: saving it refreshes the signed-in user, so
                // this line turns into "saved" and the call room won't ask again.
                <button type="button" onClick={() => setAskContact(true)} className="underline text-amber-700 hover:text-amber-800">
                  Add an emergency contact (needed to join)
                </button>
              )}
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className="text-teal-600">•</span>
              {voice ? 'Allow your microphone when asked' : 'Allow your camera and microphone when asked'}
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className="text-teal-600">•</span>
              A quiet, private place · Chrome or Safari works best
            </li>
          </ul>
        </div>
        {open ? (
          <button
            type="button"
            onClick={() => navigate(`/video-call/${session._id}`)}
            className="shrink-0 rounded-full bg-[#0097b2] hover:bg-[#007c93] text-white font-semibold text-sm px-6 py-3"
          >
            Join session
          </button>
        ) : (
          <span className="shrink-0 rounded-full border border-teal-200 bg-white text-teal-800 text-sm font-medium px-5 py-2.5 text-center">
            Opens {countdown(new Date(window_.opensAt).getTime() - now)}
          </span>
        )}
      </div>
      <EmergencyContactModal
        isOpen={askContact}
        onClose={() => setAskContact(false)}
        onSaved={() => setAskContact(false)}
      />
    </section>
  );
};

export default SessionDayBanner;
