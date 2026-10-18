import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { FiCheck, FiCreditCard, FiX } from 'react-icons/fi';
import { AdminApiError, adminFetch, adminQueryRetry, errorMessage } from '../../utils/adminApi';
import { formatPlatformDateTime } from '../../utils/dateUtils';
import { Card, ConfirmModal, EmptyState, FilterPills, LoadingBlock, QueryErrorState, ReasonModal, Spinner } from './AdminUI';

type BankStatus = 'pending_admin_approval' | 'approved' | 'rejected';

interface BankSubmission {
  doctorId: string;
  name: string;
  email: string;
  phone?: string;
  status: BankStatus;
  payoutApproved: boolean;
  rejectionReason: string | null;
  accountHolderName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  panNumber: string | null;
  submittedAt: string | null;
}

const FILTERS: ReadonlyArray<{ key: BankStatus; label: string }> = [
  { key: 'pending_admin_approval', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const DetailGrid: React.FC<{ sub: BankSubmission }> = ({ sub }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
    {([
      ['Account holder', sub.accountHolderName],
      ['Account number', sub.accountNumber],
      ['IFSC', sub.ifsc],
      ['PAN', sub.panNumber],
    ] as const).map(([label, value]) => (
      <div key={label}>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{label}</div>
        <div className="text-sm text-neutral-900 font-mono break-all" data-field={label}>{value || '—'}</div>
      </div>
    ))}
  </div>
);

/**
 * Super admin only. Approving bank details decides where real money is sent
 * and makes a therapist bookable, so it is confirmed against the exact
 * details on screen — and sent with the submission's timestamp, so details
 * the doctor replaced after this list loaded are never approved unseen.
 */
const BankDetailsTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<BankStatus>('pending_admin_approval');
  const [approving, setApproving] = useState<BankSubmission | null>(null);
  const [rejecting, setRejecting] = useState<BankSubmission | null>(null);

  const list = useQuery({
    queryKey: ['admin', 'bank-details', status],
    queryFn: () => adminFetch<{ submissions?: BankSubmission[] }>(`/admin/payments/payouts/bank-details?status=${status}`),
    retry: adminQueryRetry,
  });
  const submissions = list.data?.submissions ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'bank-details'] });

  const onDecisionError = (err: unknown, fallback: string) => {
    toast.error(errorMessage(err, fallback));
    // 409: the doctor resubmitted since this list loaded — show what is
    // actually there now.
    if (err instanceof AdminApiError && err.status === 409) refresh();
  };

  const approve = useMutation({
    mutationFn: (sub: BankSubmission) =>
      adminFetch<{ message?: string }>(`/admin/payments/payouts/bank-details/${sub.doctorId}/approve`, {
        method: 'POST',
        body: { submittedAt: sub.submittedAt },
      }),
    onSuccess: (data) => { toast.success(data?.message || 'Bank details approved'); setApproving(null); refresh(); },
    onError: (err) => { setApproving(null); onDecisionError(err, 'Failed to approve bank details'); },
  });

  const reject = useMutation({
    mutationFn: ({ sub, reason }: { sub: BankSubmission; reason: string }) =>
      adminFetch<{ message?: string }>(`/admin/payments/payouts/bank-details/${sub.doctorId}/reject`, {
        method: 'POST',
        body: { reason, submittedAt: sub.submittedAt },
      }),
    onSuccess: (data) => { toast.success(data?.message || 'Bank details rejected'); setRejecting(null); refresh(); },
    onError: (err) => { setRejecting(null); onDecisionError(err, 'Failed to reject bank details'); },
  });

  const busyFor = (doctorId: string) =>
    (approve.isPending && approve.variables?.doctorId === doctorId)
    || (reject.isPending && reject.variables?.sub.doctorId === doctorId);

  const heading = status === 'pending_admin_approval'
    ? 'Bank Details Awaiting Review'
    : status === 'approved' ? 'Approved Bank Details' : 'Rejected Bank Details';
  const hint = status === 'pending_admin_approval'
    ? 'Approving makes a therapist bookable. Check the name matches the account before you do.'
    : status === 'approved'
      ? 'Where each therapist is paid. Use these details to make the weekly transfers.'
      : 'Sent back to the therapist to correct and resubmit.';

  return (
    <div className="space-y-4">
      <FilterPills<BankStatus> value={status} onChange={setStatus} options={FILTERS} />

      <Card>
        <div className="px-6 py-4 border-b border-neutral-100 bg-neutral-50/50 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-neutral-800">{heading}</h3>
            <p className="text-[11px] text-neutral-500 mt-0.5">{hint}</p>
          </div>
          {list.isSuccess && (
            <span className="text-xs font-medium text-neutral-600 bg-neutral-100 px-2.5 py-1 rounded-full whitespace-nowrap">
              {submissions.length}
            </span>
          )}
        </div>

        {list.isError ? (
          <QueryErrorState error={list.error} onRetry={() => { void list.refetch(); }} retrying={list.isFetching} title="Couldn't load bank details" />
        ) : list.isLoading ? (
          <LoadingBlock label="Loading bank details…" />
        ) : submissions.length === 0 ? (
          <EmptyState icon={<FiCreditCard size={28} />} title={status === 'pending_admin_approval' ? 'Nothing to review' : `No ${status === 'approved' ? 'approved' : 'rejected'} bank details`} />
        ) : (
          <div className="divide-y divide-neutral-100">
            {submissions.map((sub) => {
              const busy = busyFor(sub.doctorId);
              return (
                <div key={sub.doctorId} data-bank-row={sub.email} className="p-6">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-900">{sub.name}</p>
                      <p className="text-[11px] text-neutral-500 break-all">{sub.email}{sub.phone ? ` · ${sub.phone}` : ''}</p>
                      <div className="mt-3"><DetailGrid sub={sub} /></div>
                      {sub.submittedAt && (
                        <p className="text-[11px] text-neutral-400 mt-3">Submitted {formatPlatformDateTime(sub.submittedAt)} IST</p>
                      )}
                      {sub.status === 'rejected' && sub.rejectionReason && (
                        <p className="text-[11px] text-red-600 mt-1"><span className="font-semibold">Reason:</span> {sub.rejectionReason}</p>
                      )}
                    </div>
                    {sub.status === 'pending_admin_approval' && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setApproving(sub)}
                          disabled={busy}
                          className="flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg disabled:opacity-50"
                        >
                          {approve.isPending && approve.variables?.doctorId === sub.doctorId ? <Spinner /> : <FiCheck size={14} />}
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => setRejecting(sub)}
                          disabled={busy}
                          className="flex items-center gap-1.5 text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 px-4 py-2 rounded-lg disabled:opacity-50"
                        >
                          <FiX size={14} /> Reject
                        </button>
                      </div>
                    )}
                    {sub.status === 'approved' && (
                      <span className="self-start text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">Approved</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <ConfirmModal
        open={!!approving}
        title="Approve these bank details?"
        confirmLabel="Approve"
        tone="success"
        busy={approve.isPending}
        wide
        onClose={() => setApproving(null)}
        onConfirm={() => approving && approve.mutate(approving)}
      >
        {approving && (
          <div className="space-y-4">
            <p>
              {approving.name}'s weekly payouts will be sent to this account, and they will become bookable.
              Check the holder's name matches the therapist.
            </p>
            <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-4"><DetailGrid sub={approving} /></div>
          </div>
        )}
      </ConfirmModal>

      <ReasonModal
        open={!!rejecting}
        title="Reject these bank details"
        description={rejecting ? <>{rejecting.name} will see this and can resubmit.</> : null}
        label="What needs correcting?"
        placeholder="e.g. The account holder name does not match your registered name"
        confirmLabel="Reject"
        busy={reject.isPending}
        onClose={() => setRejecting(null)}
        onSubmit={(reason) => rejecting && reject.mutate({ sub: rejecting, reason })}
      />
    </div>
  );
};

export default BankDetailsTab;
