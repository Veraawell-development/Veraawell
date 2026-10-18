import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { FiFileText } from 'react-icons/fi';
import { Archive, CheckCircle, Clock, Edit, Eye, EyeOff, Filter, RotateCcw, Search, Star } from 'lucide-react';
import { adminFetch, adminQueryRetry, errorMessage } from '../../utils/adminApi';
import { formatPlatformDate } from '../../utils/dateUtils';
import { ARTICLE_CATEGORIES } from '../../data/articleCategories';
import { Card, ConfirmModal, LoadingBlock, Pager, QueryErrorState, Spinner } from './AdminUI';
import type { Pagination } from './types';

interface Article {
  _id: string;
  title: string;
  slug?: string;
  category: string;
  status: 'draft' | 'published' | 'archived';
  featured: boolean;
  publishedDate?: string;
  views: number;
  createdAt: string;
  author: string;
}

/** 'active' sends no status: the server's default list leaves archived articles out. */
type StatusFilter = 'active' | 'published' | 'draft' | 'archived';

type Action =
  | { kind: 'feature'; article: Article }
  | { kind: 'unpublish'; article: Article }
  | { kind: 'restore'; article: Article }
  | { kind: 'archive'; article: Article };

const PAGE_SIZE = 10;

const StatusBadge: React.FC<{ status: Article['status'] }> = ({ status }) => {
  if (status === 'published') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium border border-emerald-200">
        <CheckCircle size={12} /> Published
      </span>
    );
  }
  if (status === 'archived') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-neutral-100 text-neutral-600 rounded-full text-xs font-medium border border-neutral-200">
        <Archive size={12} /> Archived
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-50 text-amber-700 rounded-full text-xs font-medium border border-amber-200">
      <Clock size={12} /> Draft
    </span>
  );
};

/** Super admin only. */
const ArticlesTab: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [page, setPage] = useState(1);
  const [archiving, setArchiving] = useState<Article | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const list = useQuery({
    queryKey: ['admin', 'articles', { page, search: debouncedSearch, category, status }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (category !== 'All') params.set('category', category);
      if (status !== 'active') params.set('status', status);
      return adminFetch<{ articles?: Article[]; pagination?: Pagination }>(`/articles/admin/all?${params}`);
    },
    placeholderData: keepPreviousData,
    retry: adminQueryRetry,
  });

  const articles = list.data?.articles ?? [];
  const pagination = list.data?.pagination;

  // Archiving or unpublishing the last row of the last page empties it:
  // step back rather than strand the admin on "No articles found".
  useEffect(() => {
    if (pagination && !list.isPlaceholderData && page > 1 && page > pagination.pages) {
      setPage(Math.max(pagination.pages, 1));
    }
  }, [pagination, list.isPlaceholderData, page]);

  const act = useMutation({
    mutationFn: (action: Action) => {
      const id = action.article._id;
      switch (action.kind) {
        case 'feature':
          return adminFetch<{ message?: string }>(`/articles/admin/${id}/feature`, { method: 'POST' });
        case 'unpublish':
        case 'restore':
          return adminFetch<{ message?: string }>(`/articles/admin/${id}`, { method: 'PUT', body: { status: 'draft' } });
        case 'archive':
          // DELETE archives (a soft delete) — the article stays recoverable.
          return adminFetch<{ message?: string }>(`/articles/admin/${id}`, { method: 'DELETE' });
      }
    },
    onSuccess: (_data, action) => {
      const title = `“${action.article.title}”`;
      const message = {
        feature: action.article.featured ? `${title} is no longer featured` : `${title} is now featured`,
        unpublish: `${title} was unpublished and is now a draft`,
        restore: `${title} was restored as a draft`,
        archive: `${title} was archived — it's under Archived if you need it back`,
      }[action.kind];
      toast.success(message);
      setArchiving(null);
      return queryClient.invalidateQueries({ queryKey: ['admin', 'articles'] });
    },
    onError: (err) => {
      toast.error(errorMessage(err, 'Failed to update the article'));
      setArchiving(null);
    },
  });

  const busyId = act.isPending ? act.variables?.article._id : null;
  const filtersActive = !!searchQuery || category !== 'All' || status !== 'active';
  const clearFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setCategory('All');
    setStatus('active');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              aria-label="Search articles"
              placeholder="Search by title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-neutral-50 rounded-lg border border-neutral-200 focus:outline-none focus:border-[#0097b2]"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <select
              aria-label="Category"
              value={category}
              onChange={(e) => { setCategory(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-8 py-2 text-xs bg-neutral-50 rounded-lg border border-neutral-200 focus:outline-none focus:border-[#0097b2] appearance-none"
            >
              {['All', ...ARTICLE_CATEGORIES].map((cat) => (
                <option key={cat} value={cat}>{cat === 'All' ? 'All categories' : cat}</option>
              ))}
            </select>
          </div>
          <div className="relative">
            <select
              aria-label="Status"
              value={status}
              onChange={(e) => { setStatus(e.target.value as StatusFilter); setPage(1); }}
              className="w-full px-4 py-2 text-xs bg-neutral-50 rounded-lg border border-neutral-200 focus:outline-none focus:border-[#0097b2] appearance-none"
            >
              <option value="active">Published &amp; drafts</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
        {filtersActive && (
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={clearFilters} className="text-[#0097b2] font-semibold hover:text-[#007c93] text-xs">
              Clear filters
            </button>
          </div>
        )}
      </Card>

      <Card>
        {list.isError ? (
          <QueryErrorState error={list.error} onRetry={() => { void list.refetch(); }} retrying={list.isFetching} title="Couldn't load articles" />
        ) : list.isLoading ? (
          <LoadingBlock label="Loading articles…" />
        ) : articles.length === 0 ? (
          <div className="p-12 text-center">
            <FiFileText size={28} className="text-neutral-200 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-neutral-900 mb-1">No articles found</h3>
            <p className="text-neutral-500 text-xs mb-4">
              {filtersActive ? 'Try adjusting your search or filters' : 'Get started by creating a new article'}
            </p>
            {filtersActive && (
              <button type="button" onClick={clearFilters} className="text-[#0097b2] font-semibold hover:text-[#007c93] text-xs">
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-100">
                  <th className="px-6 py-3 text-[11px] font-bold text-neutral-400 uppercase tracking-wider w-1/2">Article</th>
                  <th className="px-6 py-3 text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Views</th>
                  <th className="px-6 py-3 text-[11px] font-bold text-neutral-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {articles.map((article) => {
                  const busy = busyId === article._id;
                  return (
                    <tr key={article._id} data-article-row={article.title} className="hover:bg-neutral-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-neutral-800 mb-1 line-clamp-1">{article.title}</span>
                          <div className="flex items-center gap-2 text-xs text-neutral-500 flex-wrap">
                            <span className="bg-neutral-50 px-2 py-0.5 rounded border border-neutral-100 text-[10px] font-medium">{article.category}</span>
                            <span>•</span>
                            <span>{article.status === 'published' && article.publishedDate ? `Published ${formatPlatformDate(article.publishedDate)}` : `Created ${formatPlatformDate(article.createdAt)}`}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4"><StatusBadge status={article.status} /></td>
                      <td className="px-6 py-4 text-xs text-neutral-500">
                        <span className="flex items-center gap-1"><Eye size={14} className="text-neutral-400" />{article.views ?? 0}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {busy && <Spinner className="w-3.5 h-3.5 border-2 border-[#0097b2]" />}
                          {article.status !== 'archived' && (
                            <>
                              <button
                                type="button"
                                onClick={() => act.mutate({ kind: 'feature', article })}
                                disabled={busy}
                                aria-label={article.featured ? 'Unfeature' : 'Feature'}
                                title={article.featured ? 'Unfeature' : 'Feature'}
                                className={`p-1.5 rounded-lg hover:bg-neutral-50 transition-colors ${article.featured ? 'text-amber-500' : 'text-neutral-400 hover:text-amber-500'} disabled:opacity-50`}
                              >
                                <Star size={14} className={article.featured ? 'fill-current' : ''} />
                              </button>
                              <button
                                type="button"
                                onClick={() => navigate(`/super-admin-dashboard/articles/edit/${article._id}`)}
                                disabled={busy}
                                aria-label="Edit"
                                title="Edit"
                                className="p-1.5 text-blue-600 hover:bg-neutral-50 rounded-lg transition-colors disabled:opacity-50"
                              >
                                <Edit size={14} />
                              </button>
                            </>
                          )}
                          {article.status === 'published' && (
                            <button
                              type="button"
                              onClick={() => act.mutate({ kind: 'unpublish', article })}
                              disabled={busy}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-neutral-600 border border-neutral-200 hover:bg-neutral-50 rounded-lg disabled:opacity-50"
                            >
                              <EyeOff size={12} /> Unpublish
                            </button>
                          )}
                          {article.status !== 'archived' ? (
                            <button
                              type="button"
                              onClick={() => setArchiving(article)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-red-600 border border-red-200 hover:bg-red-50 rounded-lg disabled:opacity-50"
                            >
                              <Archive size={12} /> Archive
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => act.mutate({ kind: 'restore', article })}
                              disabled={busy}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-[#0097b2] border border-[#0097b2]/30 hover:bg-[#0097b2]/5 rounded-lg disabled:opacity-50"
                            >
                              <RotateCcw size={12} /> Restore to draft
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagination && (pagination.pages > 1 || page > 1) && (
          <Pager page={page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPage={setPage} disabled={list.isFetching} />
        )}
      </Card>

      <ConfirmModal
        open={!!archiving}
        title="Archive this article?"
        confirmLabel="Archive"
        tone="danger"
        busy={act.isPending && act.variables?.kind === 'archive'}
        onClose={() => setArchiving(null)}
        onConfirm={() => archiving && act.mutate({ kind: 'archive', article: archiving })}
      >
        {archiving && (
          <p>
            <span className="font-semibold text-neutral-800">“{archiving.title}”</span> will be removed from the site.
            You can find it under Archived and restore it as a draft at any time.
          </p>
        )}
      </ConfirmModal>
    </div>
  );
};

export default ArticlesTab;
