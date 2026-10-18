import { adminFetch, adminQueryRetry } from '../../utils/adminApi';
import type { Statistics } from './types';

/**
 * Queries the console shell shares with a tab, so the sidebar badge and the
 * tab read one cache entry instead of fetching twice.
 */

export const statisticsQuery = {
  queryKey: ['admin', 'statistics'] as const,
  queryFn: () => adminFetch<Statistics>('/admin/approvals/statistics'),
  retry: adminQueryRetry,
};

/** Just the new-enquiry count for the badge — one row, not the queue. */
export const newEnquiryCountQuery = {
  queryKey: ['admin', 'enquiries', 'new-count'] as const,
  queryFn: async () => {
    const res = await adminFetch<{ data?: { newCount?: number } }>('/enquiries?status=new&limit=1');
    return res?.data?.newCount ?? 0;
  },
  retry: adminQueryRetry,
};
