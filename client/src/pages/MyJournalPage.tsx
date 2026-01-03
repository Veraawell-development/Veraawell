import React, { useState, useEffect } from 'react';
import { FiMenu, FiPlus, FiEdit2, FiTrash2 } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import { formatDate } from '../utils/dateUtils';
import logger from '../utils/logger';
import { useToast } from '../hooks/useToast';
import type { JournalEntry } from '../types';

const MyJournalPage: React.FC = () => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [formData, setFormData] = useState({ title: '', content: '', mood: '' });
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showSuccess, showError, showConfirm } = useToast();

  useEffect(() => {
    fetchJournalEntries();
  }, []);

  const fetchJournalEntries = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const response = await fetch(`${API_CONFIG.BASE_URL}/session-tools/journal/patient/${user.userId}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      logger.info('Journal entries received:', data.length);
      setEntries(data);
      if (data.length > 0) {
        setSelectedEntry(data[0]);
      }
    } catch (error) {
      logger.error('Error fetching journal entries:', error);
      showError('Failed to load journal entries');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddEntry = async () => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/session-tools/journal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      });

      if (!response.ok) throw new Error('Failed to create entry');

      showSuccess('Journal entry created successfully!');
      setShowAddModal(false);
      setFormData({ title: '', content: '', mood: '' });
      fetchJournalEntries();
    } catch (error) {
      logger.error('Error creating entry:', error);
      showError('Failed to create entry');
    }
  };

  const handleUpdateEntry = async () => {
    if (!editingEntry) return;

    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/session-tools/journal/${editingEntry._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      });

      if (!response.ok) throw new Error('Failed to update entry');

      showSuccess('Journal entry updated successfully!');
      setEditingEntry(null);
      setFormData({ title: '', content: '', mood: '' });
      fetchJournalEntries();
    } catch (error) {
      logger.error('Error updating entry:', error);
      showError('Failed to update entry');
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    const confirmed = await showConfirm('Are you sure you want to delete this entry?');
    if (!confirmed) return;

    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/session-tools/journal/${entryId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) throw new Error('Failed to delete entry');

      showSuccess('Journal entry deleted successfully!');
      fetchJournalEntries();
    } catch (error) {
      logger.error('Error deleting entry:', error);
      showError('Failed to delete entry');
    }
  };

  const openEditModal = (entry: JournalEntry) => {
    setEditingEntry(entry);
    setFormData({ title: entry.title, content: entry.content, mood: entry.mood || '' });
  };


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#E0EAEA' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-cyan-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-serif">Loading journal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative" style={{ backgroundColor: '#E0EAEA' }}>
      {/* Overlay to close sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 shadow-lg transform transition-transform duration-300 ease-in-out z-50 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`} style={{ backgroundColor: '#7DA9A8' }}>
        <div className="h-full flex flex-col p-4 text-white font-serif">
          <div className="space-y-3 mb-6">
            <div
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
              onClick={() => { navigate('/patient-dashboard'); setSidebarOpen(false); }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span className="text-base font-medium">My Dashboard</span>
            </div>

            <div
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
              onClick={() => { navigate('/call-history'); setSidebarOpen(false); }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <span className="text-base font-medium">My Calls</span>
            </div>

            <div
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
              onClick={() => { navigate('/pending-tasks'); setSidebarOpen(false); }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <span className="text-base font-medium">Pending Tasks</span>
            </div>

            <div
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
              onClick={() => { navigate('/my-journal'); setSidebarOpen(false); }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span className="text-base font-medium">My Journal</span>
            </div>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="py-4 px-4 shadow-sm" style={{ backgroundColor: '#6DBEDF' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            <FiMenu className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Bree Serif, serif' }}>My Journal</h1>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-white text-cyan-600 px-4 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors flex items-center gap-2"
            style={{ fontFamily: 'Bree Serif, serif' }}
          >
            <FiPlus className="w-5 h-5" />
            Add Entry
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200">
          <div className="flex flex-col md:flex-row min-h-[600px]">
            {/* Date Sidebar */}
            <div className="w-full md:w-64 border-r border-gray-200 bg-gradient-to-b from-gray-50 to-white">
              <div className="bg-gradient-to-r from-cyan-500 to-teal-500 py-5 px-6 border-b border-cyan-600">
                <h2 className="text-xl font-bold text-white text-center tracking-wide" style={{ fontFamily: 'Bree Serif, serif' }}>DATE</h2>
              </div>
              <div className="overflow-y-auto max-h-[550px] custom-scrollbar">
                {entries.length === 0 ? (
                  <div className="py-12 px-4 text-center">
                    <svg className="w-16 h-16 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    <p className="text-gray-400 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>No entries yet</p>
                    <p className="text-gray-300 text-xs mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>Start writing your thoughts</p>
                  </div>
                ) : (
                  entries.map((entry) => (
                    <button
                      key={entry._id}
                      onClick={() => setSelectedEntry(entry)}
                      className={`w-full py-4 px-6 text-left font-medium transition-all duration-200 border-b border-gray-100 relative group ${selectedEntry?._id === entry._id
                        ? 'text-white shadow-md'
                        : 'text-gray-700 hover:bg-cyan-50'
                        }`}
                      style={{
                        backgroundColor: selectedEntry?._id === entry._id ? '#6DBEDF' : 'transparent',
                        fontFamily: 'Bree Serif, serif'
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <svg className={`w-4 h-4 ${selectedEntry?._id === entry._id ? 'text-white' : 'text-cyan-500'}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                        </svg>
                        <span>{formatDate(entry.createdAt)}</span>
                      </div>
                      {selectedEntry?._id === entry._id && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-white rounded-r"></div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 p-8 bg-white">
              {selectedEntry ? (
                <div className="animate-fadeIn">
                  <div className="flex justify-between items-start mb-6 pb-4 border-b-2 border-gray-100">
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Bree Serif, serif' }}>
                        {selectedEntry.title}
                      </h2>
                      {selectedEntry.mood && (
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-cyan-50 to-teal-50 rounded-full border border-cyan-200">
                          <svg className="w-4 h-4 text-cyan-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 100-2 1 1 0 000 2zm7-1a1 1 0 11-2 0 1 1 0 012 0zm-.464 5.535a1 1 0 10-1.415-1.414 3 3 0 01-4.242 0 1 1 0 00-1.415 1.414 5 5 0 007.072 0z" clipRule="evenodd" />
                          </svg>
                          <span className="text-sm font-medium text-cyan-700" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {selectedEntry.mood}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditModal(selectedEntry)}
                        className="p-2.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-all hover:shadow-md"
                        title="Edit"
                      >
                        <FiEdit2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDeleteEntry(selectedEntry._id)}
                        className="p-2.5 text-red-600 hover:bg-red-50 rounded-lg transition-all hover:shadow-md"
                        title="Delete"
                      >
                        <FiTrash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  <div className="prose prose-lg max-w-none">
                    <div className="text-gray-700 leading-relaxed whitespace-pre-line text-base" style={{ fontFamily: 'Inter, sans-serif', lineHeight: '1.8' }}>
                      {selectedEntry.content}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <svg className="w-24 h-24 text-gray-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-xl text-gray-400 font-medium" style={{ fontFamily: 'Bree Serif, serif' }}>Select a date to view entry</p>
                  <p className="text-sm text-gray-300 mt-2" style={{ fontFamily: 'Inter, sans-serif' }}>Choose from the dates on the left</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingEntry) && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl transform transition-all animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold" style={{ fontFamily: 'Bree Serif, serif', color: '#6DBEDF' }}>
                  {editingEntry ? 'Edit Journal Entry' : 'Add Journal Entry'}
                </h2>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingEntry(null);
                    setFormData({ title: '', content: '', mood: '' });
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-full"
                  aria-label="Close"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all"
                    placeholder="Enter title"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Mood (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.mood}
                    onChange={(e) => setFormData({ ...formData, mood: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all"
                    placeholder="e.g., Happy, Anxious, Calm"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Content <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    rows={10}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all resize-none"
                    placeholder="Write your thoughts..."
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={editingEntry ? handleUpdateEntry : handleAddEntry}
                  disabled={!formData.title || !formData.content}
                  className="flex-1 py-3.5 rounded-xl font-bold text-white transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 disabled:bg-gray-300 disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none"
                  style={{
                    fontFamily: 'Bree Serif, serif',
                    background: (!formData.title || !formData.content) ? undefined : 'linear-gradient(135deg, #6DBEDF 0%, #5DBEBD 100%)'
                  }}
                >
                  {editingEntry ? 'Update Entry' : 'Add Entry'}
                </button>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingEntry(null);
                    setFormData({ title: '', content: '', mood: '' });
                  }}
                  className="flex-1 bg-gray-100 text-gray-700 py-3.5 rounded-xl font-bold hover:bg-gray-200 transition-all"
                  style={{ fontFamily: 'Bree Serif, serif' }}
                >
                  Cancel
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
