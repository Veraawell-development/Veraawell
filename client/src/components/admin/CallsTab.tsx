import React, { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FiPhoneCall } from 'react-icons/fi';
import { adminFetch, adminQueryRetry } from '../../utils/adminApi';
import { formatPlatformDateTime } from '../../utils/dateUtils';
import { Card, EmptyState, FilterPills, LoadingBlock, QueryErrorState } from './AdminUI';

/**
 * How the calls are going, measured from what both browsers report
 * (server/models/callLog.js): how many connect, how fast, how many needed
 * the relay, and why the others failed — the number to watch after Phase 3.
 */

interface Summary {
  days: number;
  calls: number;
  connected: number;
  successRate: number | null;
  relayShare: number | null;
  medianTimeToConnectMs: number | null;
  reconnects: number;
  failuresByReason: Record<string, number>;
}

interface Person { firstName?: string; lastName?: string }
interface Party { browser?: string | null; os?: string | null; candidateType?: string | null; timeToConnectMs?: number | null }
interface CallRow {
  _id: string;
  sessionId: string;
  mode?: 'video' | 'voice' | null;
  createdAt: string;
  connectedAt?: string | null;
  relayUsed?: boolean;
  reconnects?: number;
  iceRestarts?: number;
  serverRestarts?: number;
  failures?: { at?: string; party?: string; reason?: string; detail?: string }[];
  parties?: { patient?: Party; doctor?: Party };
  quality?: { rttAvgMs?: number | null; lossPct?: number | null };
  doctorId?: Person | null;
  patientId?: Person | null;
}

const REASON_LABEL: Record<string, string> = {
  CONNECTION_LOST: 'Connection lost',
  CONNECTION_FAILED: 'Could not connect',
  AUTH: 'Signed out',
  PROTOCOL_OUTDATED: 'Old page version',
  'media-error': 'Camera / mic problem',
  'ice-stuck': 'Connection stuck (rebuilt)',
  'ice-gave-up': 'Connection repair ran out',
};

/** Why a camera or mic didn't start (client/src/call/media.ts). */
const DETAIL_LABEL: Record<string, string> = {
  'permission-denied': 'permission denied',
  'permission-denied-system': 'blocked by the device settings',
  'no-device': 'no camera / mic found',
  'device-in-use': 'in use by another app',
  constraints: 'unsupported camera setting',
  insecure: 'not a secure page',
  unsupported: 'browser not supported',
  aborted: 'interrupted',
};

const name = (p?: Person | null) => (p ? [p.firstName, p.lastName].filter(Boolean).join(' ') || '—' : '—');
const seconds = (ms?: number | null) => (typeof ms === 'number' ? `${(ms / 1000).toFixed(1)} s` : '—');
const route = (c?: string | null) => (c === 'relay' ? 'Relay' : c === 'host' ? 'Direct (same network)' : c === 'srflx' || c === 'prflx' ? 'Direct' : '—');
const device = (p?: Party) => (p && (p.browser || p.os) ? `${p.browser || ''}${p.os ? ` · ${p.os}` : ''}` : '—');

const Stat: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <Card className="p-5">
    <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">{label}</p>
    <p className="text-2xl font-bold text-neutral-900 mt-1">{value}</p>
    {hint && <p className="text-xs text-neutral-400 mt-1">{hint}</p>}
  </Card>
);

const CallsTab: React.FC = () => {
  const [days, setDays] = useState<'7' | '30' | '90'>('7');
  const [show, setShow] = useState<'all' | 'failed'>('all');

  const summary = useQuery({
    queryKey: ['admin', 'calls', 'summary', days],
    queryFn: () => adminFetch<Summary>(`/admin/calls/summary?days=${days}`),
    placeholderData: keepPreviousData,
    retry: adminQueryRetry,
  });
  const list = useQuery({
    queryKey: ['admin', 'calls', 'list', show],
    queryFn: () => adminFetch<{ calls?: CallRow[] }>(`/admin/calls?limit=50${show === 'failed' ? '&failed=1' : ''}`),
    placeholderData: keepPreviousData,
    retry: adminQueryRetry,
  });

  const s = summary.data;
  const reasons = Object.entries(s?.failuresByReason || {}).sort((a, b) => b[1] - a[1]);
  const calls = list.data?.calls ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterPills value={days} onChange={setDays} options={[{ key: '7', label: 'Last 7 days' }, { key: '30', label: 'Last 30 days' }, { key: '90', label: 'Last 90 days' }]} />
      </div>

      {summary.isError ? (
        <Card><QueryErrorState error={summary.error} onRetry={() => { void summary.refetch(); }} retrying={summary.isFetching} /></Card>
      ) : !s ? (
        <Card><LoadingBlock /></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Calls connected" value={s.successRate === null ? '—' : `${s.successRate}%`} hint={`${s.connected} of ${s.calls} calls`} />
            <Stat label="Time to connect" value={seconds(s.medianTimeToConnectMs)} hint="median, once both are in" />
            <Stat label="Through the relay" value={s.relayShare === null ? '—' : `${s.relayShare}%`} hint="of connected calls" />
            <Stat label="Recoveries" value={String(s.reconnects)} hint="drops that reconnected by themselves" />
          </div>
          {reasons.length > 0 && (
            <Card className="p-5">
              <p className="text-sm font-semibold text-neutral-800 mb-3">Why calls had problems</p>
              <ul className="space-y-1.5">
                {reasons.map(([reason, count]) => (
                  <li key={reason} className="flex justify-between text-sm text-neutral-600">
                    <span>{REASON_LABEL[reason] || reason}</span>
                    <span className="font-semibold text-neutral-900">{count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-neutral-800">Recent calls</h3>
        <FilterPills value={show} onChange={setShow} options={[{ key: 'all', label: 'All' }, { key: 'failed', label: 'With problems' }]} />
      </div>
      <Card>
        {list.isError ? (
          <QueryErrorState error={list.error} onRetry={() => { void list.refetch(); }} retrying={list.isFetching} />
        ) : !list.data ? (
          <LoadingBlock />
        ) : calls.length === 0 ? (
          <EmptyState icon={<FiPhoneCall size={28} />} title={show === 'failed' ? 'No calls with problems' : 'No calls yet'} hint="Calls appear here once someone joins one." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3">When</th>
                  <th className="text-left px-4 py-3">Therapist · Patient</th>
                  <th className="text-left px-4 py-3">Result</th>
                  <th className="text-left px-4 py-3">Route</th>
                  <th className="text-left px-4 py-3">Devices</th>
                  <th className="text-left px-4 py-3">Quality</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {calls.map((c) => {
                  const problems = c.failures || [];
                  return (
                    <tr key={c._id} className="align-top">
                      <td className="px-4 py-3 whitespace-nowrap text-neutral-600">
                        {formatPlatformDateTime(c.createdAt)}
                        <span className="block text-xs text-neutral-400">{c.mode === 'voice' ? 'Voice' : 'Video'}</span>
                      </td>
                      <td className="px-4 py-3 text-neutral-800">{name(c.doctorId)}<span className="block text-xs text-neutral-500">{name(c.patientId)}</span></td>
                      <td className="px-4 py-3">
                        {c.connectedAt
                          ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Connected</span>
                          : <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">Never connected</span>}
                        {(c.reconnects || 0) > 0 && <span className="block text-xs text-neutral-500 mt-1">{c.reconnects} recovered drop{c.reconnects === 1 ? '' : 's'}</span>}
                        {problems.slice(-2).map((f, i) => (
                          <span key={i} className="block text-xs text-red-600 mt-1">
                            {f.party ? `${f.party}: ` : ''}{REASON_LABEL[f.reason || ''] || f.reason}
                            {f.detail ? ` — ${DETAIL_LABEL[f.detail] || f.detail}` : ''}
                          </span>
                        ))}
                      </td>
                      <td className="px-4 py-3 text-neutral-600">
                        {c.relayUsed ? 'Relay' : route(c.parties?.patient?.candidateType || c.parties?.doctor?.candidateType)}
                        <span className="block text-xs text-neutral-400">{seconds(c.parties?.patient?.timeToConnectMs ?? c.parties?.doctor?.timeToConnectMs)}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-600">
                        <span className="block">T: {device(c.parties?.doctor)}</span>
                        <span className="block">P: {device(c.parties?.patient)}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-600 whitespace-nowrap">
                        {typeof c.quality?.rttAvgMs === 'number' ? `${Math.round(c.quality.rttAvgMs)} ms` : '—'}
                        {typeof c.quality?.lossPct === 'number' && <span className="block">{c.quality.lossPct}% loss at worst</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default CallsTab;
