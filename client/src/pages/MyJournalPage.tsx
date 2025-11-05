import React, { useState, useEffect } from 'react';
import { FiMenu, FiPlus, FiEdit2, FiTrash2 } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface JournalEntry {
  _id: string;
  title: string;
  content: string;
  mood?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

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

  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5001/api' 
    : 'https://veraawell-backend.onrender.com/api';

  useEffect(() => {
    fetchJournalEntries();
  }, []);

  const fetchJournalEntries = async () => {
    try {
      setLoading(true);
      if (!user) return;

      console.log('📔 Fetching journal entries for patient:', user.userId);
      const response = await fetch(`${API_BASE_URL}/session-tools/journal/patient/${user.userId}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('📔 Journal entries received:', data.length);
      setEntries(data);
      if (data.length > 0) {
        setSelectedEntry(data[0]);
      }
    } catch (error) {
      console.error('Error fetching journal entries:', error);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddEntry = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/session-tools/journal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      });

      if (!response.ok) throw new Error('Failed to create entry');

      alert('Journal entry created successfully!');
      setShowAddModal(false);
      setFormData({ title: '', content: '', mood: '' });
      fetchJournalEntries();
    } catch (error) {
      console.error('Error creating entry:', error);
      alert('Failed to create entry');
    }
  };

  const handleUpdateEntry = async () => {
    if (!editingEntry) return;

    try {
      const response = await fetch(`${API_BASE_URL}/session-tools/journal/${editingEntry._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      });

      if (!response.ok) throw new Error('Failed to update entry');

      alert('Journal entry updated successfully!');
      setEditingEntry(null);
      setFormData({ title: '', content: '', mood: '' });
      fetchJournalEntries();
    } catch (error) {
      console.error('Error updating entry:', error);
      alert('Failed to update entry');
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm('Are you sure you want to delete this entry?')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/session-tools/journal/${entryId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) throw new Error('Failed to delete entry');

      alert('Journal entry deleted successfully!');
      fetchJournalEntries();
    } catch (error) {
      console.error('Error deleting entry:', error);
      alert('Failed to delete entry');
    }
  };

  const openEditModal = (entry: JournalEntry) => {
    setEditingEntry(entry);
    setFormData({ title: entry.title, content: entry.content, mood: entry.mood || '' });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleString('en-US', { month: 'long' });
    const year = date.getFullYear();
    
    const suffix = (day: number) => {
      if (day > 3 && day < 21) return 'th';
      switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
      }
    };
    
    return `${day}${suffix(day)} ${month} ${year}`;
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
      <div className={`fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 shadow-lg transform transition-transform duration-300 ease-in-out z-50 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
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
        <div className="bg-white border-2 border-gray-300">
          <div className="flex flex-col md:flex-row min-h-[600px]">
            {/* Date Sidebar */}
            <div className="w-full md:w-56 border-r-2 border-gray-900">
              <div className="bg-white border-b-2 border-gray-900 py-4 px-6">
                <h2 className="text-xl font-bold text-gray-900 text-center" style={{ fontFamily: 'Bree Serif, serif' }}>DATE</h2>
              </div>
              <div className="overflow-y-auto max-h-[550px]">
                {entries.length === 0 ? (
                  <div className="py-8 px-4 text-center">
                    <p className="text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>No entries yet</p>
                  </div>
                ) : (
                  entries.map((entry) => (
                    <button
                      key={entry._id}
                      onClick={() => setSelectedEntry(entry)}
                      className={`w-full py-4 px-6 text-left font-medium transition-colors border-b border-gray-900 ${
                        selectedEntry?._id === entry._id
                          ? 'text-white'
                          : 'text-gray-900 hover:bg-gray-50'
                      }`}
                      style={{ 
                        backgroundColor: selectedEntry?._id === entry._id ? '#6DBEDF' : 'transparent',
                        fontFamily: 'Bree Serif, serif'
                      }}
                    >
                      {formatDate(entry.createdAt)}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 p-8">
              {selectedEntry ? (
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>
                      {selectedEntry.title}
                    </h2>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditModal(selectedEntry)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <FiEdit2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDeleteEntry(selectedEntry._id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <FiTrash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  {selectedEntry.mood && (
                    <p className="text-sm text-gray-600 mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
                      Mood: {selectedEntry.mood}
                    </p>
                  )}
                  <div className="text-gray-900 leading-relaxed whitespace-pre-line text-base" style={{ fontFamily: 'Bree Serif, serif' }}>
                    {selectedEntry.content}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-xl text-gray-400" style={{ fontFamily: 'Inter, sans-serif' }}>Select a date to view entry</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingEntry) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-6" style={{ fontFamily: 'Bree Serif, serif', color: '#6DBEDF' }}>
                {editingEntry ? 'Edit Journal Entry' : 'Add Journal Entry'}
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Title *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    placeholder="Enter title"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Mood (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.mood}
                    onChange={(e) => setFormData({ ...formData, mood: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    placeholder="e.g., Happy, Anxious, Calm"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Content *
                  </label>
                  <textarea
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    rows={10}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
                    placeholder="Write your thoughts..."
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={editingEntry ? handleUpdateEntry : handleAddEntry}
                  disabled={!formData.title || !formData.content}
                  className="flex-1 bg-cyan-600 text-white py-3 rounded-lg font-semibold hover:bg-cyan-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  style={{ fontFamily: 'Bree Serif, serif' }}
                >
                  {editingEntry ? 'Update Entry' : 'Add Entry'}
                </button>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingEntry(null);
                    setFormData({ title: '', content: '', mood: '' });
                  }}
                  className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
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
