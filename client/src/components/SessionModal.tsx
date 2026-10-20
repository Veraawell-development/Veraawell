import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import EmergencyContactModal from './EmergencyContactModal';
import RatingModal from './RatingModal';
import { API_BASE_URL } from '../config/api';
import { resolveSessionStart, PLATFORM_TIMEZONE, formatSessionClock } from '../utils/dateUtils';
import { toast } from 'react-hot-toast';
import { calculateRefundPreview } from '../utils/refundPolicy';
import { canJoinNow, hasEnded, joinWindow, outcomeLabel, cancelResultMessage, type SessionLike } from '../utils/sessionRules';
import { getAuthToken } from '../utils/authToken';
import { useDialog } from '../hooks/useDialog';
import { useNow } from '../hooks/useNow';

interface Session extends SessionLike {
  _id: string;
  sessionDate: string;
  sessionTime: string;
  status: 'payment_pending' | 'scheduled' | 'completed' | 'cancelled' | 'no-show' | 'ended' | 'active';
  patientId: {
    _id?: string;
    firstName: string;
    lastName: string;
  };
  doctorId: {
    _id?: string;
    firstName: string;
    lastName: string;
  };
  meetingLink?: string;
  sessionType: string;
  callMode?: string;
  price: number;
  duration?: number;
  /** Patient lists: whether the patient has already rated their therapist for it. */
  rated?: boolean;
}

interface SessionModalProps {
  session: Session | null;
  userRole: 'patient' | 'doctor';
  isOpen: boolean;
  onClose: () => void;
  /** Open straight on the rating form (the "Rate Session" button elsewhere). */
  startWithRating?: boolean;
  /** Open straight on the cancel confirmation (a Cancel button elsewhere). */
  startWithCancel?: boolean;
}

/** The therapist's public profile, as GET /sessions/doctors/:id returns it. */
interface DoctorDetails {
  profileImage?: string;
  experience?: number | string;
  qualification?: string | string[];
  specialization?: string | string[];
  languages?: string | string[];
}

const list = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value.filter(Boolean).join(', ') : value || '').trim();

const authHeaders = (json = false): HeadersInit => {
  const headers: Record<string, string> = json ? { 'Content-Type': 'application/json' } : {};
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

/** "Dr. Asha Rao" — without doubling a "Dr" the name already carries. */
const drName = (d: { firstName?: string; lastName?: string } | null | undefined) => {
  if (!d?.firstName) return 'your therapist';
  const name = `${d.firstName} ${d.lastName || ''}`.trim().replace(/^dr\.?\s+/i, '');
  return `Dr. ${name}`;
};

const SessionModal: React.FC<SessionModalProps> = ({ session, userRole, isOpen, onClose, startWithRating = false, startWithCancel = false }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  // Set when the refund changed between showing it and pressing Cancel.
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);
  useEffect(() => {
    if (isOpen && startWithCancel) setShowCancelConfirm(true);
    if (!isOpen) { setShowCancelConfirm(false); setCancelNotice(null); setError(null); }
  }, [isOpen, startWithCancel]);
  // Opened just to cancel: backing out closes it, rather than revealing the
  // details view underneath.
  const backOutOfCancel = () => { setCancelNotice(null); if (startWithCancel) onClose(); else setShowCancelConfirm(false); };
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [hasEmergencyContact, setHasEmergencyContact] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  // Whether the patient has rated this session — known from the list when it
  // says so, otherwise asked. The form used to open before this was known,
  // so an already-rated session got the form and a "duplicate" error.
  const [hasRating, setHasRating] = useState(false);
  const [ratingChecked, setRatingChecked] = useState(false);
  const [patientEmergencyContact, setPatientEmergencyContact] = useState<any>(null);
  const [doctorProfile, setDoctorProfile] = useState<DoctorDetails | null>(null);
  const [doctorProfileState, setDoctorProfileState] = useState<'loading' | 'ok' | 'missing'>('loading');

  // Ticks while open, so the refund preview and the Cancel button follow the
  // clock (the 4-hour mark, the start) instead of the moment the panel opened.
  const now = useNow(15_000, isOpen);
  // Escape answers the innermost dialog: the rating form over this one closes
  // alone. (The emergency-contact form handles no keys, so this one stands
  // down while it is open.)
  const dialog = useDialog(isOpen && !showEmergencyModal, showCancelConfirm ? backOutOfCancel : onClose, showCancelConfirm ? 'cancel' : 'details');

  // startsAt when present; otherwise the legacy pair read as IST. Feeds the
  // refund preview, so a viewer-offset error here is a money error on screen.
  const sessionDateTime = session ? resolveSessionStart(session) : new Date();

  useEffect(() => {
    if (!isOpen || !session) return;
    if (userRole === 'patient') {
      checkEmergencyContact();
      checkRatingStatus();
      fetchDoctorProfile();
    } else {
      fetchPatientEmergencyContact();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userRole, session]);

  // "Rate Session" elsewhere: the form, once we know it hasn't been rated.
  useEffect(() => {
    if (isOpen && startWithRating && ratingChecked && !hasRating && session?.status === 'completed') setShowRatingModal(true);
  }, [isOpen, startWithRating, ratingChecked, hasRating, session?.status]);

  const checkEmergencyContact = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/patients/emergency-contact`, { credentials: 'include', headers: authHeaders() });
      if (response.ok) {
        const data = await response.json();
        setHasEmergencyContact(!!(data.emergencyContact?.name && data.emergencyContact?.phone));
      }
    } catch {
      // Unknown: joining asks for it, which is safe.
    }
  };

  const checkRatingStatus = async () => {
    if (!session) return;
    setRatingChecked(false);
    if (session.status !== 'completed') { setHasRating(false); setRatingChecked(true); return; }
    if (typeof session.rated === 'boolean') { setHasRating(session.rated); setRatingChecked(true); return; }
    try {
      const response = await fetch(`${API_BASE_URL}/reviews/check/${session._id}`, { credentials: 'include', headers: authHeaders() });
      if (response.ok) {
        const data = await response.json();
        setHasRating(!!data.hasReview);
      }
    } catch {
      // Unknown: offer the form; the server refuses a second rating.
    } finally {
      setRatingChecked(true);
    }
  };

  const fetchPatientEmergencyContact = async () => {
    if (!session || !session.patientId) return;
    try {
      const patientId = typeof session.patientId === 'object' ? session.patientId._id : session.patientId;
      const response = await fetch(`${API_BASE_URL}/sessions/patients/${patientId}/emergency-contact`, { credentials: 'include', headers: authHeaders() });
      if (response.ok) {
        const data = await response.json();
        setPatientEmergencyContact(data.emergencyContact);
      }
    } catch {
      setPatientEmergencyContact(null);
    }
  };

  // The therapist's real details, or none. When the profile can't be read —
  // typically a therapist who is no longer listed — this used to show
  // invented ones ("6+ years", "M. Phil, M. Sc", "Hindi, English").
  const fetchDoctorProfile = async () => {
    if (!session || !session.doctorId) { setDoctorProfileState('missing'); return; }
    setDoctorProfileState('loading');
    try {
      const doctorId = typeof session.doctorId === 'object' ? session.doctorId._id : session.doctorId;
      const response = await fetch(`${API_BASE_URL}/sessions/doctors/${doctorId}`, { credentials: 'include' });
      if (!response.ok) { setDoctorProfile(null); setDoctorProfileState('missing'); return; }
      setDoctorProfile(await response.json());
      setDoctorProfileState('ok');
    } catch {
      setDoctorProfile(null);
      setDoctorProfileState('missing');
    }
  };

  const handleRatingSubmit = () => {
    // The rating form stays open on its "what happens next" panel.
    setHasRating(true);
  };

  if (!isOpen || !session) return null;

  // From 15 minutes before the start until the session really ends — the
  // server's window (utils/sessionRules.ts).
  const joinable = canJoinNow(session, now);
  const outcome = outcomeLabel(session, userRole);

  // A booked session, before it starts, can be cancelled by either side: the
  // patient under the refund policy, the doctor always with a full refund to
  // the patient (counted on the doctor's record). Not once it has started —
  // the server refuses that, and the button used to stay.
  const cancellable = session.status === 'scheduled' && session.sessionType !== 'immediate' && sessionDateTime.getTime() > now.getTime();
  const isDoctor = userRole === 'doctor';
  const patientFirstName = session.patientId?.firstName || 'The patient';
  const doctorId = session.doctorId && typeof session.doctorId === 'object' ? session.doctorId._id : undefined;
  const titleId = `session-modal-title-${session._id}`;

  const handleJoinSession = async () => {
    // Check if patient has emergency contact before joining
    if (userRole === 'patient' && !hasEmergencyContact) {
      setShowEmergencyModal(true);
      return;
    }
    await proceedWithJoin();
  };

  // The modal saves the contact itself (and refreshes the signed-in user, so
  // the banner and the call room stop asking) and reports a failed save in
  // place; here it only has to carry on into the call.
  const handleEmergencyContactSaved = async () => {
    setHasEmergencyContact(true);
    setShowEmergencyModal(false);
    await proceedWithJoin();
  };

  const proceedWithJoin = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/sessions/join/${session._id}`, { credentials: 'include', headers: authHeaders() });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to join session');
      }
      const data = await response.json();
      if (data.meetingLink) {
        // Extract session ID from meeting link (format: /video-call/SESSION_ID)
        navigate(`/video-call/${data.meetingLink.split('/').pop()}`);
      } else {
        setError('The call isn\'t ready yet. Please try again closer to the start time.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to join session');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSession = async () => {
    // The preview is re-checked at the moment of confirming: a panel left open
    // across the 4-hour mark promised a full refund the server then refused.
    if (!isDoctor) {
      const shown = calculateRefundPreview(session.price, sessionDateTime, now);
      const fresh = calculateRefundPreview(session.price, sessionDateTime, new Date());
      if (fresh.amount !== shown.amount) {
        setCancelNotice('It\'s now within 4 hours of the start, so this cancellation would not be refunded. Please check and confirm again.');
        setLoading(false);
        return;
      }
    }
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/sessions/${session._id}/cancel`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(true),
        body: JSON.stringify(isDoctor && cancelReason.trim() ? { reason: cancelReason.trim() } : {})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Failed to cancel session');

      toast.success(isDoctor
        ? `Session cancelled. ${patientFirstName} has been refunded in full and told.`
        : cancelResultMessage(data), { duration: 6000 });
      setShowCancelConfirm(false);
      setCancelNotice(null);
      onClose();
      // Every list that shows this session reads it again — it used to reload
      // the whole page.
      void queryClient.invalidateQueries();
    } catch (err: any) {
      setShowCancelConfirm(false);
      setError(err.message || 'Failed to cancel session');
    } finally {
      setLoading(false);
    }
  };

  const overlayClass = 'fixed inset-0 flex items-center justify-center z-50 p-3 sm:p-4';
  const overlayStyle = { backgroundColor: 'rgba(0, 0, 0, 0.5)' };

  // ── Cancel Confirmation Modal with refund preview ──
  if (showCancelConfirm) {
    const { amount: refundAmount, label: refundLabel, color: refundColor } = calculateRefundPreview(session.price, sessionDateTime, now);

    return (
      <div className={overlayClass} style={overlayStyle} onClick={backOutOfCancel}>
        <div
          ref={dialog.ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${titleId}-cancel`}
          tabIndex={-1}
          className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 max-h-[90dvh] overflow-y-auto outline-none"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Icon */}
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <svg aria-hidden="true" className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>

          <h2 id={`${titleId}-cancel`} className="text-xl font-bold text-center text-gray-900 mb-1">Cancel this session?</h2>
          <p className="text-sm text-center text-gray-500 mb-6">This action cannot be undone.</p>

          {isDoctor ? (
            <div className="mb-6 space-y-4">
              <div className="rounded-xl border border-red-100 bg-red-50/60 p-4 text-sm text-gray-700">
                {patientFirstName} will get a full refund of <strong>₹{session.price}</strong>.
                This counts as a cancellation on your profile.
              </div>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Reason (shared with the patient, optional)</span>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value.slice(0, 300))}
                  rows={3}
                  maxLength={300}
                  className="mt-1.5 w-full rounded-xl border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                  placeholder="e.g. A family emergency — I'm sorry for the short notice."
                />
                <span className="block text-right text-[11px] text-gray-400">{cancelReason.length}/300</span>
              </label>
            </div>
          ) : (
          <div className="rounded-xl border p-4 mb-6" style={{ borderColor: refundColor + '40', background: refundColor + '0d' }} aria-live="polite">
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: refundColor }}>Refund Policy</p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-600">{refundLabel}</span>
              <span className="text-lg font-bold" style={{ color: refundColor }}>₹{refundAmount}</span>
            </div>
            {refundAmount > 0 && (
              <p className="text-xs text-gray-400 mt-2">Refund will appear in your original payment method within 5–7 working days.</p>
            )}
          </div>
          )}

          {cancelNotice && (
            <p role="alert" className="mb-4 rounded-xl bg-amber-50 border border-amber-100 p-3 text-sm text-amber-800">{cancelNotice}</p>
          )}

          <div className="flex gap-3">
            <button
              onClick={backOutOfCancel}
              className="flex-1 py-3 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Keep session
            </button>
            <button
              onClick={() => { setCancelNotice(null); void handleCancelSession(); }}
              disabled={loading}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50"
              style={{ background: '#ef4444' }}
            >
              {loading ? 'Cancelling…' : isDoctor ? 'Cancel session' : 'Yes, cancel'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const opensAt = joinWindow(session).opensAt;
  const upcoming = session.status === 'scheduled' && !joinable && !hasEnded(session, now) && opensAt.getTime() > now.getTime();
  const details = doctorProfile
    ? [
        ['Experience', doctorProfile.experience ? `${doctorProfile.experience} years` : ''],
        ['Qualification', list(doctorProfile.qualification)],
        ['Specialization', list(doctorProfile.specialization)],
        ['Languages', list(doctorProfile.languages)],
      ].filter(([, value]) => value)
    : [];

  // The forms that open over this one are rendered beside it, not inside its
  // overlay: inside, a click anywhere in them bubbled to the overlay's
  // click-to-close and shut both (the rating stars closed the details).
  return (
    <>
    <div className={overlayClass} style={overlayStyle} onClick={onClose}>
      <div
        ref={dialog.ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full relative font-sans max-h-[90dvh] overflow-y-auto outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button - Top Right */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-50 text-2xl transition-colors z-10"
          style={{ lineHeight: 1 }}
          aria-label="Close session details"
        >
          <span aria-hidden="true">×</span>
        </button>

        <div className="p-5 sm:p-10 space-y-6 sm:space-y-8">
          {/* Header */}
          <div className="text-center">
            <h2 id={titleId} className="text-xl sm:text-2xl font-bold text-gray-800">
              Session Details
            </h2>
          </div>

          {error && (
            <div role="alert" className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-center text-sm">
              {error}
            </div>
          )}

          {/* Doctor/Patient Info Card */}
          <div className="rounded-xl p-4 sm:p-6 border border-gray-100" style={{ backgroundColor: '#F9FAFB' }}>
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 text-center sm:text-left">
              {/* Profile Image */}
              <div className="rounded-xl overflow-hidden flex-shrink-0 border border-gray-100 w-20 h-20 sm:w-[120px] sm:h-[120px]">
                <img
                  src={(userRole === 'patient' && doctorProfile?.profileImage) || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 24 24' fill='%23A0AEC0'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E"}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 24 24' fill='%23A0AEC0'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
                  }}
                />
              </div>

              {/* Doctor/Patient Details */}
              <div className="flex-1 min-w-0 space-y-2">
                <h3 className="text-xl sm:text-2xl font-bold text-gray-800 break-words">
                  {userRole === 'patient'
                    ? (session.doctorId ? drName(session.doctorId) : 'Therapist')
                    : (session.patientId ? `${session.patientId.firstName} ${session.patientId.lastName}` : 'Patient')
                  }
                </h3>
                {userRole === 'patient' && doctorProfileState === 'ok' && details.length > 0 && (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-600 text-left">
                    {details.map(([label, value]) => (
                      <div key={label} className={label === 'Specialization' || label === 'Languages' ? 'sm:col-span-2' : undefined}>
                        <dt className="inline font-semibold text-gray-700">{label}:</dt> <dd className="inline">{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {userRole === 'patient' && doctorProfileState === 'missing' && (
                  <p className="text-sm text-gray-500">This therapist is no longer listed on Veraawell.</p>
                )}
              </div>
            </div>
          </div>

          {/* Session Info Card */}
          <div className="rounded-xl p-4 sm:p-6 border border-gray-100" style={{ backgroundColor: '#F9FAFB' }}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 text-center text-sm text-gray-600">
              <div className="space-y-1 md:border-r border-gray-200">
                <p className="font-semibold text-gray-700">Date</p>
                <p>{sessionDateTime.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: PLATFORM_TIMEZONE })}</p>
              </div>
              <div className="space-y-1 md:border-r border-gray-200">
                <p className="font-semibold text-gray-700">Time</p>
                <p>{sessionDateTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: PLATFORM_TIMEZONE })} IST</p>
              </div>
              <div className="space-y-1 md:border-r border-gray-200">
                <p className="font-semibold text-gray-700">Duration</p>
                <p>{session.duration || 60} minutes</p>
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-gray-700">Mode</p>
                <p>{session.callMode || 'Video Calling'}</p>
              </div>
            </div>
          </div>

          {/* Emergency Contact Card (Doctor Only) */}
          {userRole === 'doctor' && patientEmergencyContact && (
            <div className="rounded-xl p-5 bg-red-50 border border-red-100">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <svg aria-hidden="true" className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-red-800 mb-2">Emergency Contact</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-red-700">
                    <p><span className="font-semibold">Name:</span> {patientEmergencyContact.name}</p>
                    {patientEmergencyContact.relationship && (
                      <p><span className="font-semibold">Relationship:</span> {patientEmergencyContact.relationship}</p>
                    )}
                    <p className="sm:col-span-2"><span className="font-semibold">Phone:</span> <a href={`tel:${patientEmergencyContact.phone}`} className="font-bold hover:underline">{patientEmergencyContact.phone}</a></p>
                  </div>
                  <a
                    href={`tel:${patientEmergencyContact.phone}`}
                    className="mt-3 inline-block px-4 py-2 rounded-xl font-semibold text-white text-xs transition-all hover:bg-red-600"
                    style={{ backgroundColor: '#EF4444' }}
                  >
                    Call Emergency Contact
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* When it can be joined, and the cancellation rule — an upcoming
              session used to say neither. */}
          {upcoming && (
            <div className="text-center py-3 px-4 rounded-xl bg-sky-50 border border-sky-100">
              <p className="text-sm font-semibold text-sky-900">You can join from {formatSessionClock(opensAt, 'en-US')} IST</p>
              {userRole === 'patient' && (
                <p className="text-xs mt-1 text-sky-800">Cancel more than 4 hours before the start for a full refund.</p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:justify-center gap-3 sm:gap-6 pt-2">
            {cancellable && (
              <button
                onClick={() => setShowCancelConfirm(true)}
                disabled={loading}
                className="px-8 py-3 rounded-full text-base font-semibold transition-all disabled:opacity-50 hover:bg-red-600 text-white"
                style={{ backgroundColor: '#EF4444' }}
              >
                Cancel Session
              </button>
            )}

            {joinable && (
              <button
                onClick={handleJoinSession}
                disabled={loading}
                className="px-8 py-3 rounded-full text-base font-semibold transition-all disabled:opacity-50 hover:opacity-90 text-white"
                style={{ backgroundColor: '#10B981' }}
              >
                {loading ? 'Joining...' : 'Join Session'}
              </button>
            )}

            {!joinable && session.status === 'scheduled' && hasEnded(session, now) && (
              <div className="text-center py-3 px-6 rounded-xl bg-gray-50 border border-gray-100 w-full">
                <p className="text-sm font-semibold text-gray-700">This session's time is over</p>
                <p className="text-xs mt-1 text-gray-500">What happened will show here within a few minutes.</p>
              </div>
            )}

            {(session.status === 'completed' || session.status === 'ended') && (
              <div className="space-y-3 w-full">
                <div className="text-center py-3 px-6 rounded-xl bg-green-50 border border-green-100">
                  <p className="text-sm font-semibold text-green-800">{outcome?.label || 'Completed'}</p>
                </div>

                {userRole === 'patient' && ratingChecked && !hasRating && session.status === 'completed' && (
                  <div className="flex justify-center">
                    <button
                      onClick={() => setShowRatingModal(true)}
                      className="px-6 py-2.5 rounded-full text-sm font-semibold transition-all hover:opacity-90 text-white"
                      style={{ backgroundColor: '#10B981' }}
                    >
                      Rate Session
                    </button>
                  </div>
                )}

                {userRole === 'patient' && hasRating && (
                  <div className="text-center py-2 px-4 rounded-full bg-sky-50 text-sky-700 text-xs font-medium">
                    You've rated this session — thank you
                  </div>
                )}
              </div>
            )}

            {session.status === 'cancelled' && (
              <div className="flex justify-center w-full py-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-500">
                  <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span className="text-[11px] font-bold uppercase tracking-wider">{outcome?.label || 'Session Cancelled'}</span>
                </div>
              </div>
            )}

            {session.status === 'no-show' && (
              <div className="flex justify-center w-full py-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-red-100 bg-red-50/50 text-red-500">
                  <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-[11px] font-bold uppercase tracking-wider">{outcome?.label || 'No Show'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

      {/* Emergency Contact Modal */}
      <EmergencyContactModal
        isOpen={showEmergencyModal}
        onClose={() => setShowEmergencyModal(false)}
        onSaved={() => void handleEmergencyContactSaved()}
      />

      {/* Rating Modal */}
      <RatingModal
        isOpen={showRatingModal}
        sessionId={session._id}
        doctorName={session.doctorId ? drName(session.doctorId) : 'your therapist'}
        doctorId={doctorId}
        onClose={() => setShowRatingModal(false)}
        onSubmit={handleRatingSubmit}
      />
    </>
  );
};

export default SessionModal;
