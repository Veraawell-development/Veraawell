import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { FiCheck, FiFileText, FiUserCheck, FiX } from 'react-icons/fi';
import { Trash2 } from 'lucide-react';
import { adminFetch, adminQueryRetry, errorMessage } from '../../utils/adminApi';
import { formatPlatformDate } from '../../utils/dateUtils';
import { Card, ConfirmModal, FilterPills, LoadingBlock, QueryErrorState, ReasonModal, Spinner, EmptyState } from './AdminUI';
import { ApprovalBadge, DocumentViewer, type ViewedDocument } from './shared';
import { statisticsQuery } from './queries';
import type { PendingUser } from './types';

type View = 'pending' | 'all';

const DoctorsTab: React.FC<{ isSuperAdmin: boolean }> = ({ isSuperAdmin }) => {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('pending');
  const [rejecting, setRejecting] = useState<PendingUser | null>(null);
  const [removing, setRemoving] = useState<PendingUser | null>(null);
  const [viewingDocument, setViewingDocument] = useState<ViewedDocument | null>(null);

  // Only the list on screen is fetched; the counts on the toggles come from
  // the statistics the sidebar already has.
  const list = useQuery({
    queryKey: ['admin', 'doctors', view],
    queryFn: () => adminFetch<PendingUser[]>(`/admin/approvals/doctors/${view}`),
    retry: adminQueryRetry,
  });
  const stats = useQuery(statisticsQuery);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'doctors'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'statistics'] });
  };

  const approve = useMutation({
    mutationFn: (doctorId: string) => adminFetch<{ message?: string }>(`/admin/approvals/doctors/${doctorId}/approve`, { method: 'POST' }),
    onSuccess: (data) => { toast.success(data?.message || 'Doctor approved'); refresh(); },
    onError: (err) => toast.error(errorMessage(err, 'Failed to approve doctor')),
  });

  const reject = useMutation({
    mutationFn: ({ doctorId, reason }: { doctorId: string; reason: string }) =>
      adminFetch<{ message?: string }>(`/admin/approvals/doctors/${doctorId}/reject`, { method: 'POST', body: { reason } }),
    onSuccess: (data) => { toast.success(data?.message || 'Doctor rejected'); setRejecting(null); refresh(); },
    onError: (err) => toast.error(errorMessage(err, 'Failed to reject doctor')),
  });

  const remove = useMutation({
    mutationFn: (doctorId: string) => adminFetch<{ message?: string }>(`/admin/approvals/doctors/${doctorId}`, { method: 'DELETE' }),
    onSuccess: (data) => { toast.success(data?.message || 'Doctor removed'); setRemoving(null); refresh(); },
    // e.g. 409: the doctor has sessions and must be rejected instead.
    onError: (err) => { toast.error(errorMessage(err, 'Failed to remove doctor')); setRemoving(null); },
  });

  const busyFor = (id: string) =>
    (approve.isPending && approve.variables === id)
    || (reject.isPending && reject.variables?.doctorId === id)
    || (remove.isPending && remove.variables === id);

  const doctors = list.data ?? [];

  return (
    <div className="space-y-4">
      <FilterPills<View>
        value={view}
        onChange={setView}
        options={[
          { key: 'pending', label: `Pending Approvals${stats.data?.doctors ? ` (${stats.data.doctors.pending})` : ''}` },
          { key: 'all', label: `All Doctors${stats.data?.doctors ? ` (${stats.data.doctors.total})` : ''}` },
        ]}
      />

      {list.isError ? (
        <Card><QueryErrorState error={list.error} onRetry={() => { void list.refetch(); }} retrying={list.isFetching} title="Couldn't load doctors" /></Card>
      ) : list.isLoading ? (
        <Card><LoadingBlock label="Loading doctors…" /></Card>
      ) : doctors.length === 0 ? (
        <Card>
          <EmptyState icon={<FiUserCheck size={28} />} title={view === 'pending' ? 'No pending doctor requests' : 'No doctors found'} />
        </Card>
      ) : (
        <div className="space-y-4">
          {doctors.map((user) => {
            const busy = busyFor(user._id);
            return (
              <div key={user._id} data-doctor-row={user.email} className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm flex flex-col md:flex-row justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-neutral-900">Dr. {user.firstName} {user.lastName}</h3>
                    <ApprovalBadge status={user.approvalStatus} />
                  </div>
                  <p className="text-xs text-neutral-500 break-all">{user.email}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-600 pt-1">
                    {user.phoneNumber && <span><span className="font-medium text-neutral-400">Phone:</span> +{user.countryCode || '91'} {user.phoneNumber}</span>}
                    {user.gender && <span><span className="font-medium text-neutral-400">Gender:</span> {user.gender}</span>}
                    {user.dateOfBirth && <span><span className="font-medium text-neutral-400">DOB:</span> {formatPlatformDate(user.dateOfBirth)}</span>}
                    {user.jobRole && <span><span className="font-medium text-neutral-400">Role:</span> {user.jobRole}</span>}
                    {user.specialization && <span><span className="font-medium text-neutral-400">Specialization:</span> {user.specialization}</span>}
                    {user.licenseNumber && <span><span className="font-medium text-neutral-400">License:</span> {user.licenseNumber}</span>}
                    {user.heardAboutUs && <span><span className="font-medium text-neutral-400">Source:</span> {user.heardAboutUs}</span>}
                    <span><span className="font-medium text-neutral-400">Registered:</span> {formatPlatformDate(user.createdAt)}</span>
                  </div>
                  {user.approvalStatus === 'rejected' && user.rejectionReason && (
                    <p className="text-[11px] text-red-600"><span className="font-semibold">Rejection reason:</span> {user.rejectionReason}</p>
                  )}
                  {user.professionalMessage && (
                    <p className="text-[11px] text-neutral-600 bg-neutral-50 p-2.5 rounded-xl mt-2 border border-neutral-100">
                      <span className="font-semibold text-neutral-400">Message:</span> "{user.professionalMessage}"
                    </p>
                  )}
                  {user.documents && user.documents.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {user.documents.map((doc, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => setViewingDocument({ url: doc.fileUrl, fileName: doc.fileName, fileType: doc.fileType })}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-50 border border-neutral-100 text-neutral-600 rounded-xl hover:bg-neutral-100 transition-colors text-[10px] font-semibold"
                        >
                          <FiFileText size={12} className="text-neutral-400" />
                          {doc.fileName.length > 15 ? doc.fileName.substring(0, 15) + '...' : doc.fileName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex md:flex-col justify-end gap-2 shrink-0">
                  {user.approvalStatus === 'pending' && (
                    <>
                      <button
                        type="button"
                        onClick={() => approve.mutate(user._id)}
                        disabled={busy}
                        className="px-4 py-2 bg-[#0097b2] hover:bg-[#007c93] text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        {approve.isPending && approve.variables === user._id ? <Spinner /> : <FiCheck size={14} />}
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejecting(user)}
                        disabled={busy}
                        className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <FiX size={14} />
                        Reject
                      </button>
                    </>
                  )}
                  {isSuperAdmin && (
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
        title="Reject this doctor"
        description={rejecting ? <>Dr. {rejecting.firstName} {rejecting.lastName} ({rejecting.email}) won't be able to take bookings.</> : null}
        label="Reason for rejection"
        placeholder="e.g. The licence number could not be verified"
        confirmLabel="Reject"
        busy={reject.isPending}
        onClose={() => setRejecting(null)}
        onSubmit={(reason) => rejecting && reject.mutate({ doctorId: rejecting._id, reason })}
      />

      <ConfirmModal
        open={!!removing}
        title="Remove this doctor?"
        confirmLabel="Remove"
        tone="danger"
        busy={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing._id)}
      >
        {removing && (
          <p>
            Dr. {removing.firstName} {removing.lastName} ({removing.email}) and their profile will be deleted. This can't be undone.
            A doctor who has had sessions can't be removed — reject them instead.
          </p>
        )}
      </ConfirmModal>

      <DocumentViewer document={viewingDocument} onClose={() => setViewingDocument(null)} />
    </div>
  );
};

export default DoctorsTab;
