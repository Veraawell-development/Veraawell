import React, { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { FiRefreshCw } from 'react-icons/fi';
import { adminFetch, adminQueryRetry, errorMessage } from '../../utils/adminApi';
import { formatSessionDay, resolveSessionStart } from '../../utils/dateUtils';
import { Card, ConfirmModal, FilterPills, LoadingBlock, QueryErrorState, Spinner } from './AdminUI';
import { formatINR } from './format';

type RevenuePeriod = '7d' | '30d' | '90d' | '1y';

const PERIODS: ReadonlyArray<{ key: RevenuePeriod; label: string; long: string }> = [
  { key: '7d', label: '7 days', long: 'the last 7 days' },
  { key: '30d', label: '30 days', long: 'the last 30 days' },
  { key: '90d', label: '90 days', long: 'the last 90 days' },
  { key: '1y', label: '1 year', long: 'the last 12 months' },
];

interface RevenueData {
  period?: string;
  summary?: { totalRevenue: number; totalPlatformFee: number; totalDoctorEarnings: number; totalSessions: number };
  topDoctors?: Array<{ _id: string; name: string; email: string; sessions: number; grossRevenue: number; platformFee: number; doctorEarnings: number }>;
}

interface FailedRefund {
  _id: string;
  patientName: string;
  patientEmail?: string;
  doctorName: string;
  sessionDate?: string;
  sessionTime?: string;
  startsAt?: string;
  price: number;
  refundAmount?: number | null;
  paymentStatus: 'refund_failed' | 'refund_pending' | string;
  failureReason?: string | null;
}

/** What a retry would refund: the recorded refund amount, else the full price (as the server does). */
const refundAmountOf = (s: FailedRefund) => (s.refundAmount && s.refundAmount > 0 ? s.refundAmount : s.price);

/** Super admin only. */
const RevenueTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<RevenuePeriod>('30d');
  const [confirming, setConfirming] = useState<FailedRefund | null>(null);
  const [running, setRunning] = useState<ReadonlySet<string>>(new Set());
  const windowLabel = PERIODS.find((p) => p.key === period)?.long ?? 'the selected period';

  const revenue = useQuery({
    queryKey: ['admin', 'revenue', period],
    queryFn: () => adminFetch<RevenueData>(`/admin/payments/revenue?period=${period}`),
    placeholderData: keepPreviousData,
    retry: adminQueryRetry,
  });

  const failed = useQuery({
    queryKey: ['admin', 'failed-refunds'],
    queryFn: () => adminFetch<{ count?: number; sessions?: FailedRefund[] }>('/admin/payments/sessions/failed-refunds'),
    retry: adminQueryRetry,
  });

  const retry = useMutation({
    mutationFn: (sessionId: string) =>
      adminFetch<{ success?: boolean; message?: string }>(`/admin/payments/sessions/${sessionId}/retry-refund`, { method: 'POST' }),
    onMutate: (sessionId) => setRunning((prev) => new Set(prev).add(sessionId)),
    onSuccess: (data) => toast.success(data?.message || 'Refund retried'),
    onError: (err) => toast.error(errorMessage(err, 'Refund retry failed')),
    onSettled: (_data, _err, sessionId) => {
      setRunning((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'failed-refunds'] });
    },
  });

  const summary = revenue.data?.summary;
  const topDoctors = revenue.data?.topDoctors ?? [];
  const refunds = failed.data?.sessions ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterPills<RevenuePeriod> value={period} onChange={setPeriod} options={PERIODS} />
        {revenue.isFetching && <Spinner className="w-4 h-4 border-2 border-[#0097b2]" />}
      </div>

      {revenue.isError ? (
        <Card><QueryErrorState error={revenue.error} onRetry={() => { void revenue.refetch(); }} retrying={revenue.isFetching} title="Couldn't load revenue" /></Card>
      ) : revenue.isLoading ? (
        <Card><LoadingBlock label="Loading revenue…" /></Card>
      ) : (
        <>
          <div>
            <p className="text-[11px] text-neutral-500 mb-3">
              Paid sessions <span className="font-semibold text-neutral-700">booked in {windowLabel}</span> (by booking date, including sessions that haven't happened yet).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {([
                ['Gross Revenue', formatINR(summary?.totalRevenue), 'text-neutral-900'],
                ['Platform Fee', formatINR(summary?.totalPlatformFee), 'text-emerald-600'],
                ['Doctor Earnings', formatINR(summary?.totalDoctorEarnings), 'text-neutral-900'],
                ['Paid Sessions', String(summary?.totalSessions ?? 0), 'text-neutral-900'],
              ] as const).map(([label, value, color]) => (
                <div key={label} className="bg-white p-5 rounded-2xl border border-neutral-100 shadow-sm flex flex-col justify-center">
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">{label}</p>
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          <Card>
            <div className="px-6 py-4 border-b border-neutral-100 bg-neutral-50/50">
              <h3 className="text-sm font-semibold text-neutral-800">Doctor Earnings Breakdown</h3>
              <p className="text-[11px] text-neutral-500 mt-0.5">Delivered sessions booked in {windowLabel} — what practitioners have earned.</p>
            </div>
            {topDoctors.length === 0 ? (
              <div className="p-8 text-center"><p className="text-sm text-neutral-500">No earnings in {windowLabel}.</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-neutral-50/50 text-neutral-500 text-[11px] font-semibold uppercase tracking-wider border-b border-neutral-100">
                      <th className="p-4 pl-6 font-medium">Doctor Name</th>
                      <th className="p-4 font-medium">Sessions</th>
                      <th className="p-4 font-medium">Gross Revenue</th>
                      <th className="p-4 font-medium text-emerald-600">Platform Fee</th>
                      <th className="p-4 font-medium text-[#0097b2]">Doctor Earnings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {topDoctors.map((doc) => (
                      <tr key={doc._id}>
                        <td className="p-4 pl-6">
                          <div className="text-sm font-semibold text-neutral-900">{doc.name}</div>
                          <div className="text-[11px] text-neutral-500">{doc.email}</div>
                        </td>
                        <td className="p-4 text-sm text-neutral-700">{doc.sessions}</td>
                        <td className="p-4 text-sm text-neutral-700 font-medium">{formatINR(doc.grossRevenue)}</td>
                        <td className="p-4 text-sm text-emerald-600 font-medium">{formatINR(doc.platformFee)}</td>
                        <td className="p-4 text-sm text-[#0097b2] font-semibold">{formatINR(doc.doctorEarnings)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <Card>
        <div className="px-6 py-4 border-b border-neutral-100 bg-red-50/50 flex justify-between items-center">
          <div>
            <h3 className="text-sm font-semibold text-red-800">Failed Refunds</h3>
            <p className="text-[11px] text-red-700/70 mt-0.5">Refunds the gateway rejected, or that stopped half-way. All time.</p>
          </div>
          {failed.isSuccess && (
            <span className="text-xs font-medium text-red-600 bg-red-100 px-2.5 py-1 rounded-full">{failed.data?.count ?? refunds.length} stuck</span>
          )}
        </div>

        {failed.isError ? (
          <QueryErrorState error={failed.error} onRetry={() => { void failed.refetch(); }} retrying={failed.isFetching} title="Couldn't load failed refunds" />
        ) : failed.isLoading ? (
          <LoadingBlock />
        ) : refunds.length === 0 ? (
          <div className="p-8 text-center"><p className="text-sm text-neutral-500">No stuck refunds.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50/50 text-neutral-500 text-[11px] font-semibold uppercase tracking-wider border-b border-neutral-100">
                  <th className="p-4 pl-6 font-medium">Session / Date (IST)</th>
                  <th className="p-4 font-medium">Patient</th>
                  <th className="p-4 font-medium">Doctor</th>
                  <th className="p-4 font-medium text-red-600">Refund</th>
                  <th className="p-4 font-medium">Why it failed</th>
                  <th className="p-4 font-medium text-right pr-6">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {refunds.map((session) => {
                  const isRunning = running.has(session._id);
                  return (
                    <tr key={session._id} data-refund-row={session._id}>
                      <td className="p-4 pl-6">
                        <div className="text-[11px] text-neutral-500 font-mono mb-0.5">{session._id.substring(0, 8)}…</div>
                        <div className="text-sm font-semibold text-neutral-900">{formatSessionDay(resolveSessionStart(session))}</div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm font-semibold text-neutral-900">{session.patientName}</div>
                        <div className="text-[11px] text-neutral-500">{session.patientEmail}</div>
                      </td>
                      <td className="p-4 text-sm text-neutral-700">{session.doctorName}</td>
                      <td className="p-4 text-sm text-red-600 font-medium">
                        {formatINR(refundAmountOf(session))}
                        {refundAmountOf(session) !== session.price && (
                          <div className="text-[10px] text-neutral-400">of {formatINR(session.price)} paid</div>
                        )}
                      </td>
                      <td className="p-4 text-[11px] text-neutral-600 max-w-xs">
                        {session.paymentStatus === 'refund_pending'
                          ? 'Started but never confirmed — retry checks with the gateway first.'
                          : session.failureReason || 'No reason recorded'}
                      </td>
                      <td className="p-4 text-right pr-6">
                        <button
                          type="button"
                          onClick={() => setConfirming(session)}
                          disabled={isRunning}
                          className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {isRunning ? <Spinner className="w-3.5 h-3.5 border-2 border-red-700" /> : <FiRefreshCw size={13} />}
                          {isRunning ? 'Retrying…' : 'Retry refund'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmModal
        open={!!confirming}
        title="Retry this refund?"
        confirmLabel="Retry refund"
        tone="danger"
        onClose={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) retry.mutate(confirming._id);
          setConfirming(null);
        }}
      >
        {confirming && (
          <p>
            Refund <span className="font-semibold text-neutral-800">{formatINR(refundAmountOf(confirming))}</span> to {confirming.patientName}
            {confirming.patientEmail ? ` (${confirming.patientEmail})` : ''} for their session with {confirming.doctorName}.
            This moves real money back to the patient's original payment method.
          </p>
        )}
      </ConfirmModal>
    </div>
  );
};

export default RevenueTab;
