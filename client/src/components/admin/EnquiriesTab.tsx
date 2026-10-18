import React, { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { FiCheck, FiClock, FiInbox, FiMail } from 'react-icons/fi';
import { adminFetch, adminQueryRetry, errorMessage } from '../../utils/adminApi';
import { formatPlatformDate } from '../../utils/dateUtils';
import { Card, EmptyState, FilterPills, LoadingBlock, Pager, QueryErrorState, Spinner } from './AdminUI';
import type { Pagination } from './types';

/** An inbound enquiry from the careers page or /contact. See server/models/enquiry.js. */
interface Enquiry {
  _id: string;
  type: 'partner' | 'other' | 'contact';
  name: string;
  email: string;
  phone?: string;
  organisation?: string;
  subject?: string;
  message: string;
  status: 'new' | 'in_progress' | 'closed';
  adminNotes?: string;
  handledBy?: { _id: string; name?: string; firstName?: string; lastName?: string; email?: string } | null;
  handledAt?: string | null;
  createdAt: string;
}

const ENQUIRY_TYPE_LABEL: Record<Enquiry['type'], string> = {
  partner: 'Partnership',
  other: 'Careers page query',
  contact: 'Contact form',
};

const ENQUIRY_STATUS_STYLE: Record<Enquiry['status'], string> = {
  new: 'bg-amber-50 text-amber-700 border-amber-200',
  in_progress: 'bg-sky-50 text-sky-700 border-sky-200',
  closed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

type StatusFilter = 'all' | Enquiry['status'];
type TypeFilter = 'all' | Enquiry['type'];

const PAGE_SIZE = 20;

const handlerName = (h: Enquiry['handledBy']) =>
  h ? (h.name || [h.firstName, h.lastName].filter(Boolean).join(' ') || h.email || 'an admin') : null;

/** Super admin only. */
const EnquiriesTab: React.FC = () => {
  const queryClient = useQueryClient();
  // Defaults to 'new' so the queue opens on what needs attention.
  const [status, setStatus] = useState<StatusFilter>('new');
  const [type, setType] = useState<TypeFilter>('all');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['admin', 'enquiries', 'list', { status, type, page }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (status !== 'all') params.set('status', status);
      if (type !== 'all') params.set('type', type);
      return adminFetch<{ data?: { enquiries?: Enquiry[]; newCount?: number; pagination?: Pagination } }>(`/enquiries?${params}`);
    },
    placeholderData: keepPreviousData,
    retry: adminQueryRetry,
  });

  const enquiries = list.data?.data?.enquiries ?? [];
  const pagination = list.data?.data?.pagination;

  // Closing the last enquiry on a page leaves it empty: step back.
  useEffect(() => {
    if (pagination && page > Math.max(pagination.pages, 1)) setPage(Math.max(pagination.pages, 1));
  }, [pagination, page]);

  const update = useMutation({
    mutationFn: ({ id, status: next }: { id: string; status: Enquiry['status'] }) =>
      adminFetch(`/enquiries/${id}`, { method: 'PATCH', body: { status: next } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'enquiries'] });
      toast.success('Enquiry updated');
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to update enquiry')),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterPills<StatusFilter>
          value={status}
          onChange={(next) => { setStatus(next); setPage(1); }}
          options={[
            { key: 'new', label: 'New' },
            { key: 'in_progress', label: 'In Progress' },
            { key: 'closed', label: 'Closed' },
            { key: 'all', label: 'All' },
          ]}
        />
        <div className="flex items-center gap-2">
          {list.isFetching && !list.isLoading && <Spinner className="w-3.5 h-3.5 border-2 border-[#0097b2]" />}
          <label htmlFor="enquiry-type" className="sr-only">Enquiry type</label>
          <select
            id="enquiry-type"
            value={type}
            onChange={(e) => { setType(e.target.value as TypeFilter); setPage(1); }}
            className="px-3 py-2 text-xs bg-white rounded-xl border border-neutral-200 focus:outline-none focus:border-[#0097b2]"
          >
            <option value="all">All types</option>
            <option value="partner">Partner enquiries</option>
            <option value="other">Careers queries</option>
            <option value="contact">Contact form</option>
          </select>
        </div>
      </div>

      {list.isError ? (
        <Card><QueryErrorState error={list.error} onRetry={() => { void list.refetch(); }} retrying={list.isFetching} title="Couldn't load enquiries" /></Card>
      ) : list.isLoading ? (
        <Card><LoadingBlock label="Loading enquiries…" /></Card>
      ) : enquiries.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FiInbox size={28} />}
            title={status === 'all' ? 'No enquiries yet' : `No ${status.replace('_', ' ')} enquiries`}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {enquiries.map((enquiry) => {
            const isExpanded = expanded === enquiry._id;
            const rowBusy = update.isPending && update.variables?.id === enquiry._id;
            const handler = handlerName(enquiry.handledBy);
            // Long messages are clamped to three lines with a toggle, so one
            // essay does not push the rest of the queue off screen. Rendered
            // as text, never as HTML.
            return (
              <div key={enquiry._id} data-enquiry-card={enquiry._id} className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm">
                <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0 md:max-w-2xl">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-neutral-900">{enquiry.name}</h3>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${ENQUIRY_STATUS_STYLE[enquiry.status]}`}>
                        {enquiry.status.replace('_', ' ')}
                      </span>
                      <span className="inline-flex items-center px-1.5 py-0.5 bg-neutral-50 text-neutral-600 rounded-full text-[10px] font-medium border border-neutral-200">
                        {ENQUIRY_TYPE_LABEL[enquiry.type]}
                      </span>
                    </div>

                    <a href={`mailto:${enquiry.email}`} className="text-xs text-[#0097b2] hover:underline inline-flex items-center gap-1.5 break-all">
                      <FiMail size={11} />
                      {enquiry.email}
                    </a>

                    {enquiry.organisation && (
                      <p className="text-[11px] text-neutral-600"><span className="font-medium text-neutral-400">Organisation:</span> {enquiry.organisation}</p>
                    )}
                    {enquiry.phone && (
                      <p className="text-[11px] text-neutral-600"><span className="font-medium text-neutral-400">Phone:</span> {enquiry.phone}</p>
                    )}
                    {enquiry.subject && (
                      <p className="text-[11px] text-neutral-600"><span className="font-medium text-neutral-400">Subject:</span> {enquiry.subject}</p>
                    )}

                    <p className={`text-xs text-neutral-700 pt-1 whitespace-pre-wrap break-words ${isExpanded ? '' : 'line-clamp-3'}`}>
                      {enquiry.message}
                    </p>
                    {enquiry.message.length > 180 && (
                      <button
                        type="button"
                        onClick={() => setExpanded(isExpanded ? null : enquiry._id)}
                        className="text-[11px] font-semibold text-[#0097b2] hover:underline"
                      >
                        {isExpanded ? 'Show less' : 'Show full message'}
                      </button>
                    )}

                    <p className="text-[11px] text-neutral-400 pt-1">
                      Received {formatPlatformDate(enquiry.createdAt)}
                      {enquiry.handledAt && ` · last updated ${formatPlatformDate(enquiry.handledAt)}${handler ? ` by ${handler}` : ''}`}
                    </p>
                  </div>

                  <div className="flex md:flex-col justify-end gap-2 flex-shrink-0">
                    {enquiry.status !== 'in_progress' && (
                      <button
                        type="button"
                        onClick={() => update.mutate({ id: enquiry._id, status: 'in_progress' })}
                        disabled={rowBusy}
                        className="px-4 py-2 bg-[#0097b2] hover:bg-[#007c93] text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                      >
                        <FiClock size={14} />
                        In Progress
                      </button>
                    )}
                    {enquiry.status !== 'closed' && (
                      <button
                        type="button"
                        onClick={() => update.mutate({ id: enquiry._id, status: 'closed' })}
                        disabled={rowBusy}
                        className="px-4 py-2 border border-neutral-200 text-neutral-600 hover:bg-neutral-50 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                      >
                        <FiCheck size={14} />
                        Close
                      </button>
                    )}
                    {enquiry.status === 'closed' && (
                      <button
                        type="button"
                        onClick={() => update.mutate({ id: enquiry._id, status: 'new' })}
                        disabled={rowBusy}
                        className="px-4 py-2 border border-neutral-200 text-neutral-600 hover:bg-neutral-50 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                      >
                        Reopen
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pagination && (pagination.pages > 1 || page > 1) && (
        <Card>
          <Pager page={page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPage={setPage} disabled={list.isFetching} />
        </Card>
      )}
    </div>
  );
};

export default EnquiriesTab;
