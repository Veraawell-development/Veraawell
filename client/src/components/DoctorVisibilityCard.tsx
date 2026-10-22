import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '../config/api';
import { useAuth } from '../context/AuthContext';

/**
 * "Can patients find you?" — what the directory needs from a therapist, and
 * which of it is missing (server: services/doctorVisibility.js).
 *
 * The dashboard used to warn only about calendar dates. A therapist with no
 * prices, or bank details still waiting for approval, saw nothing wrong and
 * waited for bookings that could not come.
 */

export interface VisibilityCheck {
  key: 'profile' | 'prices' | 'bank' | 'dates';
  ok: boolean;
  title: string;
  detail: string;
  fix: string;
  status?: string;
}

export interface Visibility {
  visible: boolean;
  instantReady: boolean;
  online: boolean;
  checks: VisibilityCheck[];
}

export const visibilityQueryKey = (userId?: string) => ['doctor', 'visibility', userId];

export function useDoctorVisibility() {
  const { user } = useAuth();
  return useQuery<Visibility>({
    queryKey: visibilityQueryKey(user?.userId),
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/profile/visibility`, { credentials: 'include' });
      if (!res.ok) throw new Error('Could not check your listing');
      return res.json();
    },
    enabled: !!user?.userId && user?.role === 'doctor',
    staleTime: 30_000,
  });
}

const T = { text: '#16262a', text2: '#6b7573', teal: '#1f7a8c', green: '#2b8a7a', amber: '#a97c3f', amberBg: '#fdf6ec', border: 'rgba(201,154,91,.35)' };

/**
 * The checklist when something is missing; nothing at all once every item is
 * done (`compact` shows a one-line "listed" note instead, for Settings).
 */
const DoctorVisibilityCard: React.FC<{ only?: VisibilityCheck['key'][]; compact?: boolean; collapsible?: boolean }> = ({ only, compact, collapsible }) => {
  const navigate = useNavigate();
  const { data } = useDoctorVisibility();
  // On the dashboard the full list pushed the whole page down; there it
  // starts as one line of chips, each still one tap from its fix.
  const [expanded, setExpanded] = useState(!collapsible);
  if (!data) return null;
  const checks = only ? data.checks.filter((c) => only.includes(c.key)) : data.checks;
  const missing = checks.filter((c) => !c.ok);

  if (missing.length === 0) {
    if (!compact) return null;
    return (
      <div role="status" style={{ fontSize: 12.5, color: T.green, fontWeight: 600 }}>
        ✓ Patients can find and book you.
      </div>
    );
  }

  const go = (fix: string) => {
    const [path, hash] = fix.split('#');
    navigate(hash ? `${path}#${hash}` : path);
  };

  if (!expanded) {
    return (
      <section aria-label="What patients need before they can book you" data-testid="visibility-card"
        style={{ background: T.amberBg, border: `1px solid ${T.border}`, borderRadius: 12, padding: '8px 12px', color: T.text, maxWidth: 640, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px', fontSize: 12.5 }}>
        <strong style={{ fontWeight: 700 }}>{data.visible ? 'A few things to finish:' : "Patients can't find you yet:"}</strong>
        {missing.map((c) => (
          <button key={c.key} type="button" data-check={c.key} data-ok="false" onClick={() => go(c.fix)} title={c.detail}
            style={{ border: '1px solid rgba(201,154,91,.45)', background: '#fff', borderRadius: 100, padding: '2px 10px', fontSize: 12, fontWeight: 600, color: T.amber, cursor: 'pointer' }}>
            {({ profile: 'Profile', prices: 'Prices', bank: c.status === 'pending_admin_approval' ? 'Bank (in review)' : 'Bank details', dates: 'Weekly times' } as Record<string, string>)[c.key]}
          </button>
        ))}
        <button type="button" onClick={() => setExpanded(true)} style={{ border: 'none', background: 'none', padding: 0, color: T.teal, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
          Details
        </button>
      </section>
    );
  }

  return (
    <section
      aria-label="What patients need before they can book you"
      data-testid="visibility-card"
      style={{ background: T.amberBg, border: `1px solid ${T.border}`, borderRadius: 14, padding: '12px 16px', color: T.text, maxWidth: 640 }}
    >
      <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>
        {data.visible ? 'A few things to finish' : "Patients can't find you yet"}
      </p>
      <p style={{ fontSize: 12, color: T.text2, margin: '2px 0 8px' }}>
        {data.visible ? 'You are listed, but these still need you.' : 'Finish these and your profile appears in the directory.'}
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {checks.map((c) => (
          <li key={c.key} data-check={c.key} data-ok={c.ok ? 'true' : 'false'} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5 }}>
            <span aria-hidden="true" style={{ flex: 'none', width: 16, height: 16, borderRadius: '50%', marginTop: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', background: c.ok ? T.green : '#c99a5b' }}>
              {c.ok ? '✓' : '!'}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontWeight: 600 }}>{c.title}</strong>
              <span className="sr-only">{c.ok ? ' — done' : ' — to do'}</span>
              <span style={{ display: 'block', color: T.text2 }}>{c.detail}</span>
            </span>
            {!c.ok && c.status !== 'pending_admin_approval' && (
              <button
                type="button"
                onClick={() => go(c.fix)}
                style={{ flex: 'none', border: 'none', background: 'none', padding: 0, color: T.teal, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}
              >
                Fix →
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default DoctorVisibilityCard;
