import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiBook, FiArrowLeft, FiArrowRight, FiClock, FiAlertCircle } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import { formatDate } from '../utils/dateUtils';
import logger from '../utils/logger';
import { useToast } from '../hooks/useToast';
import type { JournalEntry } from '../types';

/** Matches the server's limits (controllers/journal.controller.js). */
const TITLE_MAX = 200;
const CONTENT_MAX = 20000;
const PAGE_SIZE = 20;

/** The server's own reason when it gives one ("The title can be at most…"). */
async function failure(response: Response, fallback: string): Promise<Error> {
  const data = await response.json().catch(() => ({}));
  return new Error(data?.message || fallback);
}

const MyJournalPage: React.FC = () => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [viewingEntry, setViewingEntry] = useState<JournalEntry | null>(null);
  const [formData, setFormData] = useState({ title: '', content: '', mood: '' });
  
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showSuccess, showError, showConfirm } = useToast();
  const queryClient = useQueryClient();

  // Paged: the server returns 20 at a time with `hasMore`. Only the first
  // page used to be fetched, so older entries looked lost.
  const {
    data, isLoading: loading, isError, refetch, isFetching,
    fetchNextPage, hasNextPage, isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ['journal', user?.userId],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const response = await fetch(`${API_CONFIG.BASE_URL}/session-tools/journal/patient/${user?.userId}?page=${pageParam}&limit=${PAGE_SIZE}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const body = await response.json();
      return { journals: (body.journals || []) as JournalEntry[], hasMore: !!body.hasMore, page: pageParam as number };
    },
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled: !!user
  });
  const entries: JournalEntry[] = data?.pages.flatMap((p) => p.journals) ?? [];

  // The dashboard's journal card has its own query; keep it in step.
  const refreshLists = () => {
    queryClient.invalidateQueries({ queryKey: ['journal', user?.userId] });
    queryClient.invalidateQueries({ queryKey: ['patient', 'journal'] });
  };

  const closeForm = () => {
    setShowAddModal(false);
    setEditingEntry(null);
    setFormData({ title: '', content: '', mood: '' });
  };

  // Escape closes whichever dialog is open.
  useEffect(() => {
    if (!viewingEntry && !showAddModal && !editingEntry) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showAddModal || editingEntry) closeForm();
      else setViewingEntry(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewingEntry, showAddModal, editingEntry]);

  const createMutation = useMutation({
    mutationFn: async (newEntry: any) => {
      const response = await fetch(`${API_CONFIG.BASE_URL}/session-tools/journal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newEntry)
      });
      if (!response.ok) throw await failure(response, 'Failed to save the entry');
      return response.json();
    },
    onSuccess: () => {
      showSuccess('Journal entry saved');
      closeForm();
      refreshLists();
    },
    onError: (error) => {
      logger.error('Error creating entry:', error);
      showError((error as Error).message || 'Failed to save the entry');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await fetch(`${API_CONFIG.BASE_URL}/session-tools/journal/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      if (!response.ok) throw await failure(response, 'Failed to save your changes');
      return response.json();
    },
    onSuccess: () => {
      showSuccess('Changes saved');
      closeForm();
      refreshLists();
    },
    onError: (error) => {
      logger.error('Error updating entry:', error);
      showError((error as Error).message || 'Failed to save your changes');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`${API_CONFIG.BASE_URL}/session-tools/journal/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to delete entry');
      return response.json();
    },
    onSuccess: () => {
      showSuccess('Journal entry deleted');
      if (viewingEntry) setViewingEntry(null);
      refreshLists();
    },
    onError: (error) => {
      logger.error('Error deleting entry:', error);
      showError('Failed to delete entry');
    }
  });

  const saving = createMutation.isPending || updateMutation.isPending;
  const canSave = !!formData.title.trim() && !!formData.content.trim() && !saving;

  const trimmed = () => ({ title: formData.title.trim(), content: formData.content, mood: formData.mood.trim() });

  const handleAddEntry = () => {
    if (!canSave) return;
    createMutation.mutate(trimmed());
  };

  const handleUpdateEntry = () => {
    if (!editingEntry || !canSave) return;
    updateMutation.mutate({ id: editingEntry._id, data: trimmed() });
  };

  const handleDeleteEntry = async (entryId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = await showConfirm('Are you sure you want to delete this entry?');
    if (!confirmed) return;
    deleteMutation.mutate(entryId);
  };

  const openEditModal = (entry: JournalEntry, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingEntry(entry);
    setFormData({ title: entry.title, content: entry.content, mood: entry.mood || '' });
    setViewingEntry(null);
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--teal)] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 text-[13px] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>Loading entries...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-[64px] md:pt-[80px] bg-[var(--bg)] font-sans selection:bg-[#F0FBFF] pb-12 box-border">
      <div className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 md:py-10">
        
        {/* Header Section */}
        <div className="mb-8 flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="max-w-2xl relative">
                <button 
                    onClick={() => navigate('/patient-dashboard')} 
                    className="flex items-center gap-2 text-[13px] font-semibold text-gray-500 hover:text-[var(--teal)] transition-colors mb-5 group"
                    aria-label="Back to Dashboard"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                >
                    <FiArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Back to Dashboard
                </button>
                
                <h1 className="page-title mb-3">
                    My Journal
                </h1>
                <p className="text-[15px] text-gray-500 font-medium leading-relaxed max-w-2xl" style={{ fontFamily: 'Inter, sans-serif' }}>
                    A safe space to write down your thoughts, reflect on your feelings, and track your daily mental health journey.
                </p>
            </div>
            
            <div className="shrink-0 pt-2 md:pt-10 md:mt-2">
                <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 text-[13px] font-semibold text-white bg-[var(--teal)] hover:bg-[var(--teal-dark)] px-5 py-2.5 rounded-full transition-all shadow-sm"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                >
                    <FiPlus className="w-4 h-4" />
                    New Entry
                </button>
            </div>
        </div>

        {/* Error State — not "Your journal is empty" */}
        {!loading && isError && (
            <div className="bg-white rounded-[16px] border border-gray-200 shadow-sm p-12 text-center max-w-3xl mx-auto mt-10" role="alert">
                <FiAlertCircle className="w-7 h-7 text-gray-400 mx-auto mb-4" aria-hidden="true" />
                <h3 className="text-[18px] font-bold text-gray-800 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                    We couldn't load your journal
                </h3>
                <p className="text-gray-500 text-[14px] mb-6" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Your entries are safe. Please check your connection and try again.
                </p>
                <button
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="px-6 py-2.5 rounded-full text-[13px] font-semibold text-white bg-[var(--teal)] hover:bg-[var(--teal-dark)] transition-colors shadow-sm disabled:opacity-60"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                >
                    {isFetching ? 'Trying…' : 'Try again'}
                </button>
            </div>
        )}

        {/* Empty State */}
        {!loading && !isError && entries.length === 0 && (
            <div className="bg-white rounded-[16px] border border-gray-200 shadow-sm p-16 text-center max-w-3xl mx-auto mt-10">
                <div className="w-16 h-16 bg-gray-50 border border-gray-100 rounded-full flex items-center justify-center mx-auto mb-5">
                    <FiBook className="w-6 h-6 text-gray-400" />
                </div>
                <h3 className="text-[18px] font-bold text-gray-800 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Your journal is empty
                </h3>
                <p className="text-gray-500 text-[14px] mb-8" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Start writing down your thoughts and feelings.
                </p>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="px-6 py-2.5 rounded-full text-[13px] font-semibold text-white bg-[var(--teal)] hover:bg-[var(--teal-dark)] transition-colors shadow-sm"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                >
                    Write First Entry
                </button>
            </div>
        )}

        {/* Journal Grid matching Patient Dashboard */}
        {!loading && !isError && entries.length > 0 && (
            <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {entries.map((entry: JournalEntry) => (
                    <div
                        key={entry._id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Read "${entry.title}"`}
                        className="bg-white rounded-[16px] border border-gray-200 shadow-sm hover:border-[var(--teal)] hover:shadow-md transition-all duration-200 flex flex-col group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)]"
                        onClick={() => setViewingEntry(entry)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewingEntry(entry); } }}
                    >
                        <div className="p-6 flex-1 flex flex-col">
                            <div className="flex justify-between items-start mb-4">
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gray-50 text-gray-600">
                                    <FiBook size={18} />
                                </div>
                                {entry.mood && (
                                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 rounded-md border border-gray-200">
                                        <span className="text-[11px] font-semibold text-gray-600 tracking-wide uppercase" style={{ fontFamily: 'Inter, sans-serif' }}>
                                            {entry.mood}
                                        </span>
                                    </div>
                                )}
                            </div>
                            
                            <h3 className="text-[16px] font-bold text-gray-800 tracking-tight mb-1 line-clamp-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                                {entry.title}
                            </h3>
                            
                            <p className="text-[14px] text-gray-500 font-medium leading-relaxed line-clamp-2 mb-6" style={{ fontFamily: 'Inter, sans-serif' }}>
                                {entry.content}
                            </p>

                            <div className="mt-auto pt-5 border-t border-gray-100 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-[12px] font-medium text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    <FiClock className="w-3.5 h-3.5" />
                                    {formatDate(entry.createdAt)}
                                </div>
                                <div className="flex items-center gap-1.5 text-gray-800 text-[13px] font-semibold group-hover:text-[var(--teal)] transition-colors" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    Read <FiArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            {hasNextPage && (
                <div className="flex justify-center mt-8">
                    <button
                        onClick={() => fetchNextPage()}
                        disabled={isFetchingNextPage}
                        className="px-6 py-2.5 rounded-full text-[13px] font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-60"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                        {isFetchingNextPage ? 'Loading…' : 'Load older entries'}
                    </button>
                </div>
            )}
            </>
        )}

      </div>

      {/* View/Read Modal */}
      {viewingEntry && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewingEntry(null)}>
          <div
            className="bg-white rounded-[20px] max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="journal-view-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 md:p-8 flex-1 overflow-y-auto">
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <h2 id="journal-view-title" className="text-[24px] font-bold text-gray-900 tracking-tight mb-2 break-words" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {viewingEntry.title}
                        </h2>
                        <div className="flex items-center gap-3">
                            <span className="text-[13px] font-medium text-gray-500 flex items-center gap-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                                <FiClock className="w-3.5 h-3.5" />
                                {formatDate(viewingEntry.createdAt)}
                            </span>
                            {viewingEntry.mood && (
                                <>
                                    <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                    <span className="text-[12px] font-semibold text-gray-600 bg-gray-100 px-2.5 py-0.5 rounded-md uppercase tracking-wider" style={{ fontFamily: 'Inter, sans-serif' }}>
                                        {viewingEntry.mood}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={() => setViewingEntry(null)}
                        aria-label="Close"
                        autoFocus
                        className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="prose prose-sm max-w-none">
                    <p className="text-[15px] text-gray-700 leading-relaxed whitespace-pre-line break-words" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {viewingEntry.content}
                    </p>
                </div>
            </div>
            
            <div className="p-4 md:p-6 border-t border-gray-100 bg-gray-50/50 rounded-b-[20px] flex justify-end gap-3">
                <button
                    onClick={(e) => handleDeleteEntry(viewingEntry._id, e)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold text-gray-500 hover:text-red-600 hover:bg-white border border-transparent hover:border-red-100 transition-all shadow-sm hover:shadow"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                >
                    <FiTrash2 className="w-4 h-4" />
                    Delete
                </button>
                <button
                    onClick={(e) => openEditModal(viewingEntry, e)}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold text-white bg-[var(--teal)] hover:bg-[var(--teal-dark)] transition-all shadow-sm"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                >
                    <FiEdit2 className="w-4 h-4" />
                    Edit Entry
                </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {(showAddModal || editingEntry) && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div
            className="bg-white rounded-[20px] max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-labelledby="journal-form-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 md:p-8 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between mb-8">
                <h2 id="journal-form-title" className="text-[20px] font-bold text-gray-900 tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {editingEntry ? 'Edit Journal Entry' : 'New Journal Entry'}
                </h2>
                <button
                  onClick={closeForm}
                  aria-label="Close"
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-5">
                <div>
                  <label htmlFor="journal-title" className="block text-[13px] font-semibold text-gray-700 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="journal-title"
                    type="text"
                    autoFocus
                    maxLength={TITLE_MAX}
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[var(--teal)]/20 focus:border-[var(--teal)] transition-all text-[14px] text-gray-800"
                    placeholder="E.g., Morning Reflections"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  />
                </div>

                <div>
                  <label htmlFor="journal-mood" className="block text-[13px] font-semibold text-gray-700 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Mood <span className="text-gray-400 font-medium normal-case tracking-normal">(Optional)</span>
                  </label>
                  <input
                    id="journal-mood"
                    type="text"
                    maxLength={50}
                    value={formData.mood}
                    onChange={(e) => setFormData({ ...formData, mood: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[var(--teal)]/20 focus:border-[var(--teal)] transition-all text-[14px] text-gray-800"
                    placeholder="E.g., Happy, Anxious, Calm"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  />
                </div>

                <div>
                  <label htmlFor="journal-content" className="block text-[13px] font-semibold text-gray-700 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Content <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="journal-content"
                    maxLength={CONTENT_MAX}
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    rows={8}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[var(--teal)]/20 focus:border-[var(--teal)] transition-all text-[14px] text-gray-800 resize-none leading-relaxed"
                    placeholder="Write your thoughts..."
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  />
                  {formData.content.length > CONTENT_MAX * 0.9 && (
                    <p className="text-[12px] text-gray-500 mt-1 text-right" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {formData.content.length.toLocaleString('en-IN')} / {CONTENT_MAX.toLocaleString('en-IN')}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <button
                  onClick={closeForm}
                  className="px-5 py-2.5 rounded-lg text-[13px] font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 transition-colors"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  Cancel
                </button>
                <button
                  onClick={editingEntry ? handleUpdateEntry : handleAddEntry}
                  disabled={!canSave}
                  className="px-6 py-2.5 rounded-lg text-[13px] font-semibold text-white bg-[var(--teal)] shadow-sm hover:bg-[var(--teal-dark)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  {saving ? 'Saving…' : editingEntry ? 'Save Changes' : 'Save Entry'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyJournalPage;
