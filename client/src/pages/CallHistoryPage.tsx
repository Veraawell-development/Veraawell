import React from 'react';
import { FiPhone } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import { useQuery } from '@tanstack/react-query';
import { outcomeLabel, refundStatusText } from '../utils/sessionRules';
import { getAuthToken } from '../utils/authToken';
import { formatPlatformDate } from '../utils/dateUtils';
import { useAuth } from '../context/AuthContext';

interface CallRecord {
  _id: string;
  name: string;
  date: string;
  startsAt?: string;
  duration: number;
  mode: 'Video Calling' | 'Voice Calling';
  paymentAmount: number;
  /** The therapist's share (therapist view). */
  doctorEarnings?: number;
  paymentStatus: string;
  refundAmount?: number;
  sessionType: string;
  status: string;
  outcome?: string | null;
  cancelledBy?: string | null;
  lateCancellation?: boolean;
}

/**
 * What became of the session. Every cancellation used to read "Cancelled &
 * Refunded", refunded or not; now it says what actually happened.
 */
/** Whether the therapist is paid for this session: not if it was refunded or cancelled in time. */
const therapistPaid = (call: CallRecord) =>
  !(call.refundAmount && call.refundAmount > 0)
  && !['refund_pending', 'refunded', 'refund_failed', 'failed', 'pending'].includes(call.paymentStatus || '')
  && !(call.status === 'cancelled' && !call.lateCancellation);

const callOutcome = (call: CallRecord, viewer: 'patient' | 'doctor') =>
  outcomeLabel({ ...call, price: call.paymentAmount, refundAmount: call.refundAmount }, viewer);

const TONE_CLASS: Record<string, string> = {
  good: 'bg-teal-50 text-[var(--teal)]',
  neutral: 'bg-gray-100 text-gray-600',
  warn: 'bg-amber-50 text-amber-700',
  bad: 'bg-red-50 text-red-600'
};

const CallHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  // Doctors reach this page too (their sidebar links here): their labels, and
  // their dashboard to go back to.
  const { user } = useAuth();
  const viewer: 'patient' | 'doctor' = user?.role === 'doctor' ? 'doctor' : 'patient';
  const { data: callHistory = [], isLoading: loading, error: queryError, refetch, isFetching } = useQuery({
    queryKey: ['patient', 'call-history'],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      const token = getAuthToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const response = await fetch(`${API_BASE_URL}/sessions/call-history`, {
        method: 'GET',
        credentials: 'include',
        headers
      });

      if (!response.ok) {
        if (response.status === 401) throw new Error('Please log in to view call history');
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.message || `HTTP ${response.status}: Failed to fetch call history`);
      }
      return await response.json();
    }
  });

  const error = queryError ? (
    queryError.message.includes('Failed to fetch') || queryError.message.includes('ERR_CONNECTION_REFUSED')
      ? "We couldn't reach Veraawell. Check your connection and try again."
      : queryError.message || 'Failed to load call history'
  ) : null;

  // In IST, like everywhere else: the viewer's own zone could put a late
  // evening session on the next day.
  const formatDate = (call: CallRecord) => {
    const day = formatPlatformDate(call.startsAt || call.date);
    // With the time: several sessions on one day were indistinguishable.
    return call.startsAt
      ? `${day} · ${new Date(call.startsAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })}`
      : day;
  };

  const getInitials = (name: string) => {
    const parts = name.replace(/^dr\.?\s+/i, '').split(' ').filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  if (loading) {
    return (
      <div className="h-[calc(100vh-80px)] flex items-center justify-center bg-[var(--bg)] font-sans">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--teal)] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 text-[13px] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>Loading call history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] pt-[64px] md:pt-[80px] bg-[var(--bg)] font-sans flex flex-col overflow-hidden box-border">
      {/* Main Content Area */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 md:py-10 flex flex-col min-h-0">
        
        <div className="mb-8 max-w-2xl relative shrink-0">
          <button 
            onClick={() => navigate(viewer === 'doctor' ? '/doctor-dashboard' : '/patient-dashboard')} 
            className="flex items-center gap-2 text-[13px] font-semibold text-gray-500 hover:text-[var(--teal)] transition-colors mb-5 group"
            aria-label="Back to Dashboard"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dashboard
          </button>
          
          <h1 className="page-title mb-3">
            Call History
          </h1>
          <p className="text-[15px] text-gray-500 font-medium leading-relaxed max-w-2xl" style={{ fontFamily: 'Inter, sans-serif' }}>
            Review your past consultation sessions and payment details.
          </p>
        </div>
        
        {error ? (
          // A failed load is said as such, with a way to retry — it used to
          // sit above "No call history yet", as if there were none.
          <div role="alert" className="bg-white rounded-[24px] border border-red-100 shadow-sm p-10 text-center max-w-3xl mx-auto mt-4 shrink-0">
            <h3 className="text-[17px] font-bold text-gray-800 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>We couldn't load your call history</h3>
            <p className="text-gray-500 text-[14px] mb-6" style={{ fontFamily: 'Inter, sans-serif' }}>{error}</p>
            <button
              onClick={() => void refetch()}
              disabled={isFetching}
              className="px-6 py-2.5 rounded-full text-[13px] font-semibold text-white bg-[var(--teal)] disabled:opacity-60"
            >
              {isFetching ? 'Trying…' : 'Try again'}
            </button>
          </div>
        ) : callHistory.length === 0 ? (
          <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm p-16 text-center max-w-3xl mx-auto mt-4 shrink-0">
            <div className="w-16 h-16 bg-gray-50 border border-gray-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <FiPhone className="w-6 h-6 text-gray-400" />
            </div>
            <h3 className="text-[18px] font-bold text-gray-800 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
              No call history yet
            </h3>
            <p className="text-gray-500 text-[14px] mb-8" style={{ fontFamily: 'Inter, sans-serif' }}>
              Your completed and cancelled sessions will appear here.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2 pb-10 min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {callHistory.map((call: CallRecord) => (
                <div
                  key={call._id}
                  className="group bg-white rounded-[16px] border border-gray-100 hover:border-teal-200 shadow-sm hover:shadow-md transition-all cursor-default overflow-hidden p-6 flex flex-col"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
                        <span className="text-[12px] font-bold text-teal-700 tracking-wider">
                          {getInitials(call.name)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <h3 className="text-[15px] font-bold text-gray-800 tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
                          {call.name}
                        </h3>
                        <p className="text-[12px] font-medium text-gray-400" style={{ fontFamily: 'Inter, sans-serif' }}>
                          {formatDate(call)}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mb-6 flex flex-wrap gap-1.5">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase ${
                      call.mode === 'Voice Calling' ? 'bg-purple-50 text-purple-600' : 'bg-teal-50 text-[var(--teal)]'
                    }`} style={{ fontFamily: 'Inter, sans-serif' }}>
                      {call.mode === 'Voice Calling' ? 'Voice' : 'Video'}
                    </span>
                    {callOutcome(call, viewer) && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide ${TONE_CLASS[callOutcome(call, viewer)!.tone]}`} style={{ fontFamily: 'Inter, sans-serif' }}>
                        {callOutcome(call, viewer)!.label}
                      </span>
                    )}
                  </div>

                  <div className="mt-auto pt-5 border-t border-gray-50 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Duration</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-[20px] font-black leading-none text-gray-800 tracking-tighter" style={{ fontFamily: 'Inter, sans-serif' }}>
                          {call.duration > 0 ? call.duration : '—'}
                        </span>
                        {call.duration > 0 && <span className="text-[12px] font-bold text-gray-400">mins</span>}
                      </div>
                    </div>
                    
                    <div className="text-right">
                      {/* A therapist sees their own share, not the patient's price. */}
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">{viewer === 'doctor' ? 'You earn' : 'Amount'}</p>
                      <span className="text-[16px] font-bold text-[var(--teal)] tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {viewer === 'doctor' && !therapistPaid(call) ? '—' : `₹${(viewer === 'doctor' ? (call.doctorEarnings ?? call.paymentAmount) : call.paymentAmount).toLocaleString('en-IN')}`}
                      </span>
                      {/* Where the refund is: started, delayed or done ("refunded"
                          used to show only once it was done, nothing before). */}
                      {refundStatusText(call) && (
                        <p className="text-[11px] font-semibold text-gray-400">
                          {viewer === 'doctor' ? (call.paymentStatus === 'refunded' ? 'patient refunded' : call.paymentStatus === 'refund_failed' ? 'refund delayed' : 'refund started') : refundStatusText(call)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CallHistoryPage;
