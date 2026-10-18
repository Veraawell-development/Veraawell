import React, { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { FiCheck, FiDollarSign, FiLock } from 'react-icons/fi';
import { adminFetch, adminQueryRetry, errorMessage } from '../../utils/adminApi';
import { formatPlatformDate, formatPlatformLocalDate } from '../../utils/dateUtils';
import { canMarkPaid, isInterruptedLock, isPeriodKey, isReadyToPay, needsTransferReference } from '../../utils/payoutRules';
import { Card, CancelButton, LoadingBlock, Modal, ModalButton, QueryErrorState, Spinner } from './AdminUI';
import { formatINR } from './format';

interface Period {
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  scheduledPayoutDate: string;
  localFrom: string;
  localTo: string;
}

interface PreviewRow {
  _id: string;
  sessionCount: number;
  grossPrice: number;
  platformFeeTotal: number;
  grossEarnings: number;
  adjustmentsTotal: number;
  netPayable: number;
  carriedForward: number;
  doctor?: { firstName: string; lastName?: string; email: string };
  profile?: { payoutApproved?: boolean; accountHolderName?: string; ifsc?: string; accountNumberLast4?: string };
  existingPayout?: { status: string } | null;
}

interface Preview {
  period: Period;
  rows: PreviewRow[];
  outstandingDebt: Array<{ _id: string; outstanding: number }>;
}

interface PayoutRow {
  _id: string;
  status: 'draft' | 'locked' | 'paid';
  netPayable?: number;
  carriedForward?: number;
  sessionCount?: number;
  totalsComputedAt?: string | null;
  transferReference?: string | null;
  paidAt?: string | null;
  doctorId?: { firstName: string; lastName?: string; email: string } | null;
  bankSnapshot?: { accountHolderName?: string | null; ifsc?: string | null; accountNumberLast4?: string | null };
}

const doctorName = (d?: { firstName: string; lastName?: string } | null) =>
  d ? `${d.firstName} ${d.lastName || ''}`.trim() : 'Unknown';

/**
 * Super admin only. The weekly run: preview what each therapist is owed,
 * draft the payouts, lock each amount, make the bank transfer, record it.
 */
const WeeklyPayoutsTab: React.FC = () => {
  const queryClient = useQueryClient();
  // '' = the server's default, the week that has just closed.
  const [period, setPeriod] = useState('');
  // What is typed (null until the admin types: shows the loaded period).
  // Applied only on Enter / "Show" — a fetch per keystroke used to replace
  // the whole tab with a spinner, unmounting this input mid-word.
  const [draft, setDraft] = useState<string | null>(null);
  const [draftError, setDraftError] = useState('');
  const [paying, setPaying] = useState<PayoutRow | null>(null);
  const [utr, setUtr] = useState('');

  const preview = useQuery({
    queryKey: ['admin', 'payout-preview', period],
    queryFn: () => adminFetch<Preview>(`/admin/payments/payouts/preview${period ? `?period=${encodeURIComponent(period)}` : ''}`),
    placeholderData: keepPreviousData,
    retry: adminQueryRetry,
  });
  const periodKey = preview.data?.period?.periodKey;

  const list = useQuery({
    queryKey: ['admin', 'payout-list', periodKey],
    queryFn: () => adminFetch<{ payouts?: PayoutRow[] }>(`/admin/payments/payouts?period=${encodeURIComponent(periodKey || '')}`),
    enabled: !!periodKey,
    placeholderData: keepPreviousData,
    retry: adminQueryRetry,
  });

  const draftValue = draft ?? periodKey ?? '';

  const applyDraft = () => {
    const value = draftValue.trim().toUpperCase();
    if (!isPeriodKey(value)) {
      setDraftError('Use an ISO week like 2026-W41');
      return;
    }
    setDraftError('');
    setDraft(value);
    setPeriod(value);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'payout-preview'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'payout-list'] });
  };

  const generate = useMutation({
    mutationFn: (key: string) => adminFetch<{ message?: string }>('/admin/payments/payouts/generate', { method: 'POST', body: { period: key } }),
    onSuccess: (data) => { toast.success(data?.message || 'Drafts generated'); refresh(); },
    // 409 for a week that hasn't ended, 400 for a malformed key.
    onError: (err) => toast.error(errorMessage(err, 'Failed to generate payouts')),
  });

  const lock = useMutation({
    mutationFn: (payoutId: string) => adminFetch<{ message?: string }>(`/admin/payments/payouts/${payoutId}/lock`, { method: 'POST' }),
    onSuccess: (data) => { toast.success(data?.message || 'Locked'); refresh(); },
    // 409 when the therapist's bank details aren't approved.
    onError: (err) => { toast.error(errorMessage(err, 'Failed to lock payout')); refresh(); },
  });

  const markPaid = useMutation({
    mutationFn: ({ payoutId, transferReference }: { payoutId: string; transferReference: string }) =>
      adminFetch<{ message?: string }>(`/admin/payments/payouts/${payoutId}/mark-paid`, {
        method: 'POST',
        body: transferReference ? { transferReference } : {},
      }),
    onSuccess: (data) => { toast.success(data?.message || 'Recorded as paid'); setPaying(null); setUtr(''); refresh(); },
    onError: (err) => { toast.error(errorMessage(err, 'Failed to record payment')); refresh(); },
  });

  const p = preview.data;
  const rows = p?.rows ?? [];
  const payouts = list.data?.payouts ?? [];

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-2xl border border-neutral-100 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Period</div>
          {p?.period ? (
            <>
              <div className="text-lg font-bold text-neutral-900">
                {p.period.periodKey} · {formatPlatformLocalDate(p.period.localFrom)} to {formatPlatformLocalDate(p.period.localTo)}
              </div>
              <div className="text-[11px] text-neutral-500 mt-0.5">
                Monday to Sunday, IST · pay on {formatPlatformDate(p.period.scheduledPayoutDate, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </>
          ) : (
            <div className="text-lg font-bold text-neutral-300">—</div>
          )}
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <form
            className="flex flex-col"
            onSubmit={(e) => { e.preventDefault(); applyDraft(); }}
          >
            <div className="flex items-center gap-2">
              <label htmlFor="payout-period" className="sr-only">Week</label>
              <input
                id="payout-period"
                value={draftValue}
                onChange={(e) => { setDraft(e.target.value); setDraftError(''); }}
                placeholder="2026-W41"
                aria-invalid={!!draftError}
                className="w-28 p-2 text-xs font-mono bg-neutral-50 rounded-lg border border-neutral-200 focus:outline-none focus:border-[#0097b2]"
              />
              <button type="submit" className="text-xs font-semibold text-[#0097b2] border border-[#0097b2]/30 hover:bg-[#0097b2]/5 px-3 py-2 rounded-lg">
                Show
              </button>
              {preview.isFetching && <Spinner className="w-3.5 h-3.5 border-2 border-[#0097b2]" />}
            </div>
            {draftError && <span role="alert" className="text-[11px] text-red-600 mt-1">{draftError}</span>}
          </form>
          <button
            type="button"
            onClick={() => periodKey && generate.mutate(periodKey)}
            disabled={generate.isPending || !periodKey || rows.length === 0 || preview.isPlaceholderData}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#0097b2] hover:bg-[#007d93] px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {generate.isPending ? <Spinner /> : <FiLock size={14} />}
            Generate drafts
          </button>
        </div>
      </div>

      {preview.isError ? (
        <Card>
          <QueryErrorState
            error={preview.error}
            onRetry={() => { void preview.refetch(); }}
            retrying={preview.isFetching}
            title={`Couldn't load ${period || 'this period'}`}
          />
        </Card>
      ) : preview.isLoading ? (
        <Card><LoadingBlock label="Working out what is owed…" /></Card>
      ) : (
        <>
          {(p?.outstandingDebt?.length || 0) > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-xs font-semibold text-amber-900">
                {p!.outstandingDebt.length} therapist(s) carry an unsettled balance from a refund
              </p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                It nets off automatically the next time they earn.
              </p>
            </div>
          )}

          <Card>
            <div className="px-6 py-4 border-b border-neutral-100 bg-neutral-50/50">
              <h3 className="text-sm font-semibold text-neutral-800">Owed This Period</h3>
              <p className="text-[11px] text-neutral-500 mt-0.5">Delivered, paid sessions not yet in a payout, up to the end of this week.</p>
            </div>
            {rows.length === 0 ? (
              <div className="p-12 text-center">
                <FiDollarSign size={28} className="mx-auto text-neutral-300 mb-3" />
                <p className="text-sm text-neutral-500">Nothing owed for this period</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-neutral-50/50 text-neutral-500 text-[11px] font-semibold uppercase tracking-wider border-b border-neutral-100">
                      <th className="p-4 pl-6 font-medium">Therapist</th>
                      <th className="p-4 font-medium">Sessions</th>
                      <th className="p-4 font-medium">Gross</th>
                      <th className="p-4 font-medium">Commission</th>
                      <th className="p-4 font-medium">Adjustments</th>
                      <th className="p-4 font-medium">Net Payable</th>
                      <th className="p-4 text-right pr-6 font-medium">Bank</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {rows.map((row) => (
                      <tr key={row._id} data-preview-row={row.doctor?.email}>
                        <td className="p-4 pl-6">
                          <div className="text-sm font-semibold text-neutral-900">{doctorName(row.doctor)}</div>
                          <div className="text-[11px] text-neutral-500">{row.doctor?.email}</div>
                        </td>
                        <td className="p-4 text-sm text-neutral-700">{row.sessionCount}</td>
                        <td className="p-4 text-sm text-neutral-700">{formatINR(row.grossPrice)}</td>
                        <td className="p-4 text-sm text-emerald-600">{formatINR(row.platformFeeTotal)}</td>
                        <td className={`p-4 text-sm ${row.adjustmentsTotal < 0 ? 'text-red-600' : 'text-neutral-400'}`}>
                          {row.adjustmentsTotal ? formatINR(row.adjustmentsTotal) : '—'}
                        </td>
                        <td className="p-4 text-sm font-semibold text-[#0097b2]">{formatINR(row.netPayable)}</td>
                        <td className="p-4 text-right pr-6">
                          {/* Shown, not just enforced: an admin must see WHY someone can't be paid. */}
                          {row.profile?.payoutApproved ? (
                            <span className="text-[11px] font-mono text-neutral-600">
                              {row.profile.accountHolderName ? `${row.profile.accountHolderName} · ` : ''}{row.profile.ifsc} ••••{row.profile.accountNumberLast4}
                            </span>
                          ) : (
                            <span className="text-[11px] font-semibold text-red-600 bg-red-50 px-2 py-1 rounded-full">Bank details not approved</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <div className="px-6 py-4 border-b border-neutral-100 bg-neutral-50/50">
              <h3 className="text-sm font-semibold text-neutral-800">Drafted &amp; Paid</h3>
            </div>
            {list.isError ? (
              <QueryErrorState error={list.error} onRetry={() => { void list.refetch(); }} retrying={list.isFetching} title="Couldn't load this period's payouts" />
            ) : list.isLoading ? (
              <LoadingBlock />
            ) : payouts.length === 0 ? (
              <div className="p-8 text-center text-sm text-neutral-500">No payouts drafted for this period yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-neutral-50/50 text-neutral-500 text-[11px] font-semibold uppercase tracking-wider border-b border-neutral-100">
                      <th className="p-4 pl-6 font-medium">Therapist</th>
                      <th className="p-4 font-medium">Status</th>
                      <th className="p-4 font-medium">Net</th>
                      <th className="p-4 font-medium">Reference</th>
                      <th className="p-4 text-right pr-6 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {payouts.map((po) => {
                      const interrupted = isInterruptedLock(po);
                      const locking = lock.isPending && lock.variables === po._id;
                      return (
                        <tr key={po._id} data-payout-row={po.doctorId?.email}>
                          <td className="p-4 pl-6">
                            <div className="text-sm text-neutral-900">{doctorName(po.doctorId)}</div>
                            <div className="text-[11px] text-neutral-500">{po.doctorId?.email}</div>
                          </td>
                          <td className="p-4">
                            <span data-status={interrupted ? 'interrupted' : po.status} className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${
                              po.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : interrupted ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : po.status === 'locked' ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : 'bg-neutral-100 text-neutral-600 border-neutral-200'}`}>
                              {interrupted ? 'lock interrupted' : po.status}
                            </span>
                          </td>
                          <td className="p-4 text-sm font-semibold text-neutral-900">
                            {po.status === 'draft' || interrupted ? '—' : formatINR(po.netPayable)}
                            {(po.carriedForward || 0) > 0 && (
                              <div className="text-[10px] text-amber-600">{formatINR(po.carriedForward)} carried forward</div>
                            )}
                          </td>
                          <td className="p-4 text-[11px] font-mono text-neutral-600">{po.transferReference || '—'}</td>
                          <td className="p-4 text-right pr-6">
                            {(po.status === 'draft' || interrupted) && (
                              <button
                                type="button"
                                onClick={() => lock.mutate(po._id)}
                                disabled={locking}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0097b2] border border-[#0097b2]/30 hover:bg-[#0097b2]/5 px-3 py-1.5 rounded-lg disabled:opacity-50"
                                title={interrupted ? 'The last lock stopped before its totals were computed. Locking again finishes it.' : undefined}
                              >
                                {locking && <Spinner className="w-3 h-3 border-2 border-[#0097b2]" />}
                                {interrupted ? 'Finish lock' : 'Lock amount'}
                              </button>
                            )}
                            {isReadyToPay(po) && (
                              <button
                                type="button"
                                onClick={() => { setPaying(po); setUtr(''); }}
                                className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg"
                              >
                                Mark paid
                              </button>
                            )}
                            {po.status === 'paid' && (
                              <span className="text-[11px] text-neutral-400">Paid {formatPlatformDate(po.paidAt)}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <Modal
        open={!!paying}
        title="Record this payout as paid"
        onClose={() => setPaying(null)}
        busy={markPaid.isPending}
        footer={paying ? (
          <>
            <CancelButton onClick={() => setPaying(null)} disabled={markPaid.isPending} />
            <ModalButton
              tone="success"
              busy={markPaid.isPending}
              disabled={!canMarkPaid(paying.netPayable, utr)}
              onClick={() => markPaid.mutate({ payoutId: paying._id, transferReference: utr.trim() })}
            >
              <FiCheck size={14} /> Confirm paid
            </ModalButton>
          </>
        ) : null}
      >
        {paying && (
          <div className="space-y-4">
            <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-4 space-y-1">
              <p className="text-sm font-semibold text-neutral-900">{formatINR(paying.netPayable)} to {doctorName(paying.doctorId)}</p>
              {paying.bankSnapshot?.accountNumberLast4 ? (
                <p className="font-mono text-[11px] text-neutral-700">
                  {paying.bankSnapshot.accountHolderName || '—'} · {paying.bankSnapshot.ifsc} · ••••{paying.bankSnapshot.accountNumberLast4}
                </p>
              ) : (
                <p className="text-[11px] text-neutral-500">No bank snapshot on this payout.</p>
              )}
              <p className="text-[11px] text-neutral-500">The full account number is in Bank Details → Approved.</p>
            </div>
            <div>
              <label htmlFor="payout-utr" className="block text-xs font-semibold text-neutral-700 mb-1.5">
                Transfer reference (UTR){needsTransferReference(paying.netPayable) ? '' : ' — optional'}
              </label>
              <input
                id="payout-utr"
                value={utr}
                onChange={(e) => setUtr(e.target.value)}
                placeholder="e.g. N123456789012345"
                className="w-full p-3 text-xs font-mono bg-neutral-50 rounded-lg border border-neutral-200 focus:outline-none focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2]"
              />
              <p className="text-[11px] text-neutral-400 mt-1.5">
                {needsTransferReference(paying.netPayable)
                  ? 'Make the transfer in your bank first, then paste its reference here. This is what the payout is reconciled against.'
                  : 'Nothing is owed this week, so there is no transfer to make; this just closes the payout.'}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default WeeklyPayoutsTab;
