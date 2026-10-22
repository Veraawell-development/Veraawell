import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '../config/api';
import { formatSessionDay } from '../utils/dateUtils';
import { outcomeLabel } from '../utils/sessionRules';

/**
 * My Patients: who the therapist sees, when they last met, what is next, and
 * one tap to that patient's notes, reports and tasks.
 *
 * It used to show an "occupation" and "primary issue" guessed from note text
 * by regex — always "Not specified" — and a session count that included
 * cancelled sessions, with no way into a patient's records.
 */

interface PatientSession {
  _id: string;
  startsAt?: string;
  duration?: number;
  status: string;
  sessionType?: string;
  callMode?: string;
  outcome?: { code?: string } | null;
  paymentStatus?: string;
  refundAmount?: number;
  cancelledBy?: string | null;
  lateCancellation?: boolean;
}

interface Patient {
  _id: string;
  firstName?: string;
  lastName?: string;
  name: string;
  completedSessions: number;
  upcomingSessions: number;
  lastSessionAt: string | null;
  nextSessionAt: string | null;
  sessions: PatientSession[];
}

const T = {
  bg: '#f6f3ec', text: '#16262a', text2: '#6b7573', muted: '#8a938f', teal: '#1f7a8c',
  border: 'rgba(27,43,46,.08)', card: 'rgba(255,255,255,.82)',
};
const SERIF = "'Newsreader', Georgia, serif";
const SANS = "'Public Sans', 'Inter', sans-serif";

const initials = (p: Patient) =>
  `${p.firstName?.[0] || p.name?.[0] || ''}${p.lastName?.[0] || ''}`.toUpperCase() || 'P';

const when = (iso: string | null) =>
  iso ? `${formatSessionDay(new Date(iso), { day: 'numeric', month: 'short', year: 'numeric' }, 'en-GB')}` : '—';

const sessionWords = (s: PatientSession) => {
  const label = outcomeLabel(s, 'doctor')?.label;
  if (label) return label;
  if (s.status === 'scheduled' || s.status === 'active') return 'Upcoming';
  return s.status;
};

const PatientDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState<string | null>(null);
  const { data: patients = [], isLoading, isError, refetch } = useQuery<Patient[]>({
    queryKey: ['doctor', 'patients'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/patients/doctor-patients`, { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json();
    }
  });

  return (
    <div className="min-h-screen pt-[64px] md:pt-[80px] box-border" style={{ background: T.bg, fontFamily: SANS, color: T.text }}>
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-8">
        <button
          onClick={() => navigate('/doctor-dashboard')}
          className="flex items-center gap-2 text-[13px] font-semibold mb-5"
          style={{ color: T.text2 }}
          aria-label="Back to dashboard"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to dashboard
        </button>
        <div style={{ fontWeight: 600, fontSize: 10, letterSpacing: '.1em', color: T.teal, textTransform: 'uppercase', marginBottom: 6 }}>— Clinical</div>
        <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 32, lineHeight: 1.15 }}>My Patients</h1>
        <p className="mt-2 mb-8" style={{ fontSize: 14, color: T.text2 }}>Everyone who has booked a session with you, next session first.</p>

        {isLoading ? (
          <p style={{ color: T.muted, fontSize: 13 }}>Loading your patients…</p>
        ) : isError ? (
          <div role="alert" className="flex items-center gap-3" style={{ fontSize: 13, color: '#b42318' }}>
            Couldn't load your patients.
            <button onClick={() => refetch()} className="font-semibold underline" style={{ color: T.teal }}>Try again</button>
          </div>
        ) : patients.length === 0 ? (
          <div className="text-center py-16 rounded-2xl" style={{ background: T.card, border: `1px solid ${T.border}` }}>
            <p style={{ fontFamily: SERIF, fontSize: 20 }}>No patients yet</p>
            <p className="mt-1" style={{ fontSize: 13, color: T.text2 }}>When a patient books and pays for a session with you, they appear here.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Your patients">
            {patients.map((p) => {
              const expanded = open === p._id;
              return (
                <li key={p._id} data-testid="patient-row" className="rounded-2xl" style={{ background: T.card, border: `1px solid ${T.border}`, boxShadow: '0 8px 24px rgba(27,43,46,.05)' }}>
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : p._id)}
                    aria-expanded={expanded}
                    className="w-full text-left flex flex-wrap items-center gap-x-5 gap-y-2 p-4 sm:p-5"
                  >
                    <span aria-hidden="true" className="flex-none flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: '50%', background: T.teal, color: '#fff', fontFamily: SERIF, fontSize: 17, fontWeight: 600 }}>
                      {initials(p)}
                    </span>
                    <span className="flex-1 min-w-[140px]">
                      <span className="block" style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</span>
                      <span className="block" style={{ fontSize: 12.5, color: T.text2 }}>
                        {p.completedSessions} session{p.completedSessions === 1 ? '' : 's'} held
                        {p.upcomingSessions > 0 ? ` · ${p.upcomingSessions} upcoming` : ''}
                      </span>
                    </span>
                    <span className="flex gap-6" style={{ fontSize: 12 }}>
                      <span><span className="block" style={{ color: T.muted, fontWeight: 600, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase' }}>Last</span>{when(p.lastSessionAt)}</span>
                      <span><span className="block" style={{ color: T.muted, fontWeight: 600, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase' }}>Next</span>{when(p.nextSessionAt)}</span>
                    </span>
                    <svg className={`w-4 h-4 flex-none transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke={T.text2} viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {expanded && (
                    <div className="px-4 sm:px-5 pb-5" style={{ borderTop: `1px solid ${T.border}` }}>
                      <div className="flex flex-wrap gap-2 pt-4">
                        {[
                          ['Session notes', `/doctor-session-notes/${p._id}`],
                          ['Reports', `/doctor-reports/${p._id}`],
                          ['Tasks', `/doctor-tasks/${p._id}`],
                          ['Messages', '/messages'],
                        ].map(([label, to]) => (
                          <button key={label} onClick={() => navigate(to)} className="px-4 py-2 rounded-full text-[12.5px] font-semibold"
                            style={{ border: `1px solid rgba(31,122,140,.3)`, color: T.teal, background: '#fff' }}>
                            {label}
                          </button>
                        ))}
                      </div>
                      <h2 className="mt-5 mb-2" style={{ fontWeight: 600, fontSize: 10, letterSpacing: '.1em', color: T.muted, textTransform: 'uppercase' }}>Sessions</h2>
                      <ul className="divide-y" style={{ borderColor: T.border }}>
                        {p.sessions.map((s) => (
                          <li key={s._id} className="py-2 flex flex-wrap justify-between gap-x-4 gap-y-0.5" style={{ fontSize: 12.5 }}>
                            <span>
                              {s.startsAt ? formatSessionDay(new Date(s.startsAt), { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }, 'en-GB') : '—'} IST
                              <span style={{ color: T.muted }}> · {s.duration || '—'} min {s.callMode === 'Voice Calling' ? 'voice' : 'video'}{s.sessionType === 'immediate' ? ' · instant' : ''}</span>
                            </span>
                            <span style={{ color: T.text2 }}>{sessionWords(s)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default PatientDetailsPage;
