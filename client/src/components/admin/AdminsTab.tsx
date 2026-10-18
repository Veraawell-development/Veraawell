import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { FiCheck, FiUsers, FiX } from 'react-icons/fi';
import { Trash2 } from 'lucide-react';
import { adminFetch, adminQueryRetry, errorMessage } from '../../utils/adminApi';
import { formatPlatformDate } from '../../utils/dateUtils';
import { Card, ConfirmModal, EmptyState, FilterPills, LoadingBlock, QueryErrorState, ReasonModal, Spinner } from './AdminUI';
import { ApprovalBadge } from './shared';
import { statisticsQuery } from './queries';
import type { PendingUser } from './types';

type View = 'pending' | 'all';

/** Super admin only: who may use the console. */
const AdminsTab: React.FC<{ currentAdminId: string }> = ({ currentAdminId }) => {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('pending');
  const [rejecting, setRejecting] = useState<PendingUser | null>(null);
  const [removing, setRemoving] = useState<PendingUser | null>(null);

  const list = useQuery({
    queryKey: ['admin', 'admins', view],
    queryFn: () => adminFetch<PendingUser[]>(`/admin/approvals/admins/${view}`),
    retry: adminQueryRetry,
  });
  const stats = useQuery(statisticsQuery);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'admins'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'statistics'] });
  };

  const approve = useMutation({
    mutationFn: (adminId: string) => adminFetch<{ message?: string }>(`/admin/approvals/admins/${adminId}/approve`, { method: 'POST' }),
    onSuccess: (data) => { toast.success(data?.message || 'Admin approved'); refresh(); },
    onError: (err) => toast.error(errorMessage(err, 'Failed to approve admin')),
  });

  const reject = useMutation({
    mutationFn: ({ adminId, reason }: { adminId: string; reason: string }) =>
      adminFetch<{ message?: string }>(`/admin/approvals/admins/${adminId}/reject`, { method: 'POST', body: { reason } }),
    onSuccess: (data) => { toast.success(data?.message || 'Admin rejected'); setRejecting(null); refresh(); },
    onError: (err) => toast.error(errorMessage(err, 'Failed to reject admin')),
  });

  const remove = useMutation({
    mutationFn: (adminId: string) => adminFetch<{ message?: string }>(`/admin/approvals/admins/${adminId}`, { method: 'DELETE' }),
    onSuccess: (data) => { toast.success(data?.message || 'Admin removed'); setRemoving(null); refresh(); },
    onError: (err) => { toast.error(errorMessage(err, 'Failed to remove admin')); setRemoving(null); },
  });

  const busyFor = (id: string) =>
    (approve.isPending && approve.variables === id)
    || (reject.isPending && reject.variables?.adminId === id)
    || (remove.isPending && remove.variables === id);

  const admins = list.data ?? [];

  return (
    <div className="space-y-4">
      <FilterPills<View>
        value={view}
        onChange={setView}
        options={[
          { key: 'pending', label: `Pending Approvals${stats.data?.admins ? ` (${stats.data.admins.pending})` : ''}` },
          { key: 'all', label: `All Admins${stats.data?.admins ? ` (${stats.data.admins.total})` : ''}` },
        ]}
      />

      {list.isError ? (
        <Card><QueryErrorState error={list.error} onRetry={() => { void list.refetch(); }} retrying={list.isFetching} title="Couldn't load admins" /></Card>
      ) : list.isLoading ? (
        <Card><LoadingBlock label="Loading admins…" /></Card>
      ) : admins.length === 0 ? (
        <Card><EmptyState icon={<FiUsers size={28} />} title={view === 'pending' ? 'No pending admin requests' : 'No admins found'} /></Card>
      ) : (
        <div className="space-y-4">
          {admins.map((user) => {
            const busy = busyFor(user._id);
            // A rejected admin can be approved after all (the server allows
            // it; only an already-approved one is refused).
            const canApprove = user.approvalStatus === 'pending' || user.approvalStatus === 'rejected';
            const isSelf = user._id === currentAdminId;
            return (
              <div key={user._id} data-admin-row={user.email} className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm flex flex-col md:flex-row justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-neutral-900">{user.firstName} {user.lastName}</h3>
                    <ApprovalBadge status={user.approvalStatus} />
                    {isSelf && <span className="text-[10px] font-medium text-neutral-400">(you)</span>}
                  </div>
                  <p className="text-xs text-neutral-500 break-all">{user.email}</p>
                  <p className="text-[11px] text-neutral-600 pt-1">
                    <span className="font-medium text-neutral-400">Role:</span> {user.role}
                  </p>
                  {user.approvalStatus === 'rejected' && user.rejectionReason && (
                    <p className="text-[11px] text-red-600"><span className="font-semibold">Rejection reason:</span> {user.rejectionReason}</p>
                  )}
                  <p className="text-[11px] text-neutral-400">Registered on {formatPlatformDate(user.createdAt)}</p>
                </div>

                <div className="flex md:flex-col justify-end gap-2 shrink-0">
                  {canApprove && (
                    <button
                      type="button"
                      onClick={() => approve.mutate(user._id)}
                      disabled={busy}
                      className="px-4 py-2 bg-[#0097b2] hover:bg-[#007c93] text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {approve.isPending && approve.variables === user._id ? <Spinner /> : <FiCheck size={14} />}
                      Approve
                    </button>
                  )}
                  {user.approvalStatus === 'pending' && (
                    <button
                      type="button"
                      onClick={() => setRejecting(user)}
                      disabled={busy}
                      className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <FiX size={14} />
                      Reject
                    </button>
                  )}
                  {!isSelf && user.role !== 'super_admin' && (
                    <button
                      type="button"
                      onClick={() => setRemoving(user)}
                      disabled={busy}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ReasonModal
        open={!!rejecting}
        title="Reject this admin request"
        description={rejecting ? <>{rejecting.firstName} {rejecting.lastName} ({rejecting.email}) won't be able to sign in.</> : null}
        label="Reason for rejection"
        placeholder="e.g. Not a member of the Veraawell team"
        confirmLabel="Reject"
        busy={reject.isPending}
        onClose={() => setRejecting(null)}
        onSubmit={(reason) => rejecting && reject.mutate({ adminId: rejecting._id, reason })}
      />

      <ConfirmModal
        open={!!removing}
        title="Remove this admin?"
        confirmLabel="Remove"
        tone="danger"
        busy={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing._id)}
      >
        {removing && <p>{removing.firstName} {removing.lastName} ({removing.email}) will lose access immediately and their account will be deleted. This can't be undone.</p>}
      </ConfirmModal>
    </div>
  );
};

export default AdminsTab;
