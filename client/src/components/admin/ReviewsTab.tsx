import React, { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { FiEye, FiEyeOff, FiFlag, FiCheck, FiStar, FiMessageSquare } from 'react-icons/fi';
import { adminFetch, adminQueryRetry, errorMessage } from '../../utils/adminApi';
import { formatPlatformDate } from '../../utils/dateUtils';
import { isReviewPublic } from '../../utils/reviewVisibility';
import { Card, EmptyState, FilterPills, LoadingBlock, Pager, QueryErrorState, Spinner } from './AdminUI';

interface PersonRef { _id?: string; firstName?: string; lastName?: string; email?: string }

interface AdminReview {
  _id: string;
  rating: number;
  feedback: string;
  positives?: string;
  improvements?: string;
  wouldRecommend?: boolean;
  reviewType: 'doctor' | 'platform';
  approvedForDisplay?: boolean;
  reviewStatus: 'pending' | 'reviewed' | 'flagged';
  adminNotes?: string;
  reviewedAt?: string | null;
  createdAt: string;
  patientId?: PersonRef | null;
  doctorId?: PersonRef | null;
}

interface ReviewsResponse {
  reviews?: AdminReview[];
  total?: number;
  totalPages?: number;
  stats?: { total: number; pending: number; reviewed: number; flagged: number; averageRating: number };
}

type TypeFilter = 'all' | 'doctor' | 'platform';
type StatusFilter = 'all' | 'pending' | 'reviewed' | 'flagged';

const PAGE_SIZE = 20;

const personName = (p?: PersonRef | null) =>
  p ? [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email || 'Unknown' : 'Deleted account';

const STATUS_STYLE: Record<AdminReview['reviewStatus'], string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  reviewed: 'bg-sky-50 text-sky-700 border-sky-200',
  flagged: 'bg-red-50 text-red-700 border-red-200',
};

const Stars: React.FC<{ rating: number }> = ({ rating }) => (
  <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <FiStar key={n} size={12} className={n <= rating ? 'text-amber-500 fill-amber-500' : 'text-neutral-300'} />
    ))}
  </span>
);

type Action =
  | { kind: 'visibility'; id: string; approved: boolean }
  | { kind: 'status'; id: string; status: 'reviewed' | 'flagged' };

/**
 * Review moderation, for both admin tiers. Doctor reviews go public on
 * submission and an admin takes one down; platform reviews (landing-page
 * testimonials) wait for an admin to show them.
 */
const ReviewsTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [type, setType] = useState<TypeFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);

  const list = useQuery({
    queryKey: ['admin', 'reviews', { type, status, page }],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), skip: String((page - 1) * PAGE_SIZE) });
      if (type !== 'all') params.set('reviewType', type);
      if (status !== 'all') params.set('status', status);
      return adminFetch<ReviewsResponse>(`/reviews/admin/all?${params}`);
    },
    placeholderData: keepPreviousData,
    retry: adminQueryRetry,
  });

  const reviews = list.data?.reviews ?? [];
  const total = list.data?.total ?? 0;
  const pages = list.data?.totalPages ?? Math.ceil(total / PAGE_SIZE);
  const stats = list.data?.stats;

  // A filter or a moderation action can leave this page past the end.
  useEffect(() => {
    if (list.isSuccess && !list.isPlaceholderData && page > 1 && page > pages) setPage(Math.max(pages, 1));
  }, [list.isSuccess, list.isPlaceholderData, page, pages]);

  // No optimistic edits: what is public is the server's call (flags,
  // approval and review history combine), so the row waits for the refetch
  // and its buttons stay disabled until then.
  const act = useMutation({
    mutationFn: (action: Action) => action.kind === 'visibility'
      ? adminFetch<{ message?: string }>(`/reviews/admin/${action.id}/approve`, { method: 'PATCH', body: { approved: action.approved } })
      : adminFetch<{ message?: string }>(`/reviews/admin/${action.id}/status`, { method: 'PATCH', body: { status: action.status } }),
    onSuccess: async (data) => {
      toast.success(data?.message || 'Review updated');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'reviews'] });
    },
    onError: (err) => {
      toast.error(errorMessage(err, 'Failed to update review'));
      void queryClient.invalidateQueries({ queryKey: ['admin', 'reviews'] });
    },
  });

  const busyId = act.isPending ? act.variables?.id : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterPills<StatusFilter>
          value={status}
          onChange={(next) => { setStatus(next); setPage(1); }}
          options={[
            { key: 'all', label: 'All' },
            { key: 'pending', label: `Pending${stats ? ` (${stats.pending})` : ''}` },
            { key: 'reviewed', label: 'Reviewed' },
            { key: 'flagged', label: `Flagged${stats ? ` (${stats.flagged})` : ''}` },
          ]}
        />
        <div className="flex items-center gap-2">
          {list.isFetching && !list.isLoading && <Spinner className="w-3.5 h-3.5 border-2 border-[#0097b2]" />}
          <label htmlFor="review-type" className="sr-only">Review type</label>
          <select
            id="review-type"
            value={type}
            onChange={(e) => { setType(e.target.value as TypeFilter); setPage(1); }}
            className="px-3 py-2 text-xs bg-white rounded-xl border border-neutral-200 focus:outline-none focus:border-[#0097b2]"
          >
            <option value="all">All reviews</option>
            <option value="doctor">Doctor reviews</option>
            <option value="platform">Platform reviews</option>
          </select>
        </div>
      </div>

      {list.isError ? (
        <Card><QueryErrorState error={list.error} onRetry={() => { void list.refetch(); }} retrying={list.isFetching} title="Couldn't load reviews" /></Card>
      ) : list.isLoading ? (
        <Card><LoadingBlock label="Loading reviews…" /></Card>
      ) : reviews.length === 0 ? (
        <Card><EmptyState icon={<FiMessageSquare size={28} />} title="No reviews match these filters" /></Card>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => {
            const isPublic = isReviewPublic(review);
            const busy = busyId === review._id;
            const flagged = review.reviewStatus === 'flagged';
            return (
              <div key={review._id} data-review-card={review._id} className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm">
                <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                  <div className="space-y-2 min-w-0 md:max-w-2xl">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Stars rating={review.rating} />
                      <span className="inline-flex items-center px-1.5 py-0.5 bg-neutral-50 text-neutral-600 rounded-full text-[10px] font-medium border border-neutral-200">
                        {review.reviewType === 'platform' ? 'Platform' : 'Doctor'}
                      </span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_STYLE[review.reviewStatus] || STATUS_STYLE.pending}`}>
                        {review.reviewStatus}
                      </span>
                      <span
                        data-visibility={isPublic ? 'public' : 'hidden'}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${isPublic ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-neutral-100 text-neutral-600 border-neutral-200'}`}
                      >
                        {isPublic ? <FiEye size={10} /> : <FiEyeOff size={10} />}
                        {isPublic ? 'Public' : 'Hidden'}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-800 whitespace-pre-wrap break-words">{review.feedback}</p>
                    {review.positives && <p className="text-[11px] text-neutral-600"><span className="font-medium text-neutral-400">Went well:</span> {review.positives}</p>}
                    {review.improvements && <p className="text-[11px] text-neutral-600"><span className="font-medium text-neutral-400">Could improve (private):</span> {review.improvements}</p>}
                    <p className="text-[11px] text-neutral-500">
                      {review.reviewType === 'doctor' && <>For <span className="font-medium text-neutral-700">Dr. {personName(review.doctorId)}</span> · </>}
                      By {personName(review.patientId)}{review.patientId?.email ? ` (${review.patientId.email})` : ''} · {formatPlatformDate(review.createdAt)}
                    </p>
                    {review.adminNotes && <p className="text-[11px] text-neutral-500"><span className="font-medium">Admin note:</span> {review.adminNotes}</p>}
                  </div>

                  <div className="flex md:flex-col justify-end gap-2 flex-shrink-0">
                    {isPublic ? (
                      <button
                        type="button"
                        onClick={() => act.mutate({ kind: 'visibility', id: review._id, approved: false })}
                        disabled={busy}
                        className="px-4 py-2 border border-neutral-200 text-neutral-700 hover:bg-neutral-50 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                      >
                        {busy && act.variables?.kind === 'visibility' ? <Spinner className="w-3.5 h-3.5 border-2 border-neutral-500" /> : <FiEyeOff size={14} />}
                        Hide
                      </button>
                    ) : !flagged && (
                      <button
                        type="button"
                        onClick={() => act.mutate({ kind: 'visibility', id: review._id, approved: true })}
                        disabled={busy}
                        className="px-4 py-2 bg-[#0097b2] hover:bg-[#007c93] text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                      >
                        {busy && act.variables?.kind === 'visibility' ? <Spinner /> : <FiEye size={14} />}
                        Show
                      </button>
                    )}
                    {!flagged && (
                      <button
                        type="button"
                        onClick={() => act.mutate({ kind: 'status', id: review._id, status: 'flagged' })}
                        disabled={busy}
                        className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                      >
                        <FiFlag size={14} />
                        Flag
                      </button>
                    )}
                    {review.reviewStatus !== 'reviewed' && (
                      <button
                        type="button"
                        onClick={() => act.mutate({ kind: 'status', id: review._id, status: 'reviewed' })}
                        disabled={busy}
                        className="px-4 py-2 border border-neutral-200 text-neutral-600 hover:bg-neutral-50 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                        title={flagged ? 'Clears the flag' : undefined}
                      >
                        <FiCheck size={14} />
                        {flagged ? 'Unflag (mark reviewed)' : 'Mark reviewed'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(pages > 1 || page > 1) && (
        <Card>
          <Pager page={page} pages={pages} total={total} limit={PAGE_SIZE} onPage={setPage} disabled={list.isFetching} />
        </Card>
      )}
    </div>
  );
};

export default ReviewsTab;
