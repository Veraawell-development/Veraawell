import React, { useState, useEffect } from 'react';
import SessionChat from './SessionChat';
import { API_BASE_URL } from '../config/api';

interface SessionToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  patientId: string;
  patientName: string;
}

const SessionToolsModal: React.FC<SessionToolsModalProps> = ({
  isOpen,
  onClose,
  sessionId,
  patientId,
  patientName
}) => {
  const [activeTab, setActiveTab] = useState<'notes' | 'tasks' | 'chat'>('notes');
  const [saving, setSaving] = useState(false);
  const [emergencyContact, setEmergencyContact] = useState<{ name: string; phone: string } | null>(null);

  // Notes state
  const [noteContent, setNoteContent] = useState('');
  const [mood, setMood] = useState('');
  const [topicsDiscussed, setTopicsDiscussed] = useState('');
  const [progressInsights, setProgressInsights] = useState('');
  const [therapeuticTechniques, setTherapeuticTechniques] = useState('');

  // Tasks state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    const fetchEmergencyContact = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/sessions/patients/${patientId}/emergency-contact`, {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          setEmergencyContact(data.emergencyContact);
        }
      } catch (error) {
        console.error('Error fetching emergency contact:', error);
      }
    };
    if (patientId && isOpen) {
      fetchEmergencyContact();
    }
  }, [patientId, isOpen]);

  if (!isOpen) return null;

  const handleSaveNotes = async () => {
    try {
      setSaving(true);
      console.log(' Saving notes:', { sessionId, patientId });

      const response = await fetch(`${API_BASE_URL}/session-tools/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId,
          patientId,
          content: noteContent,
          mood,
          topicsDiscussed,
          progressInsights,
          therapeuticTechniques
        })
      });

      console.log(' Notes response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error(' Notes error:', errorData);
        throw new Error(errorData.message || 'Failed to save notes');
      }

      const result = await response.json();
      console.log(' Notes saved:', result);

      showNotification('success', 'Session notes saved successfully!');
      // Clear form
      setNoteContent('');
      setMood('');
      setTopicsDiscussed('');
      setProgressInsights('');
      setTherapeuticTechniques('');
    } catch (error: any) {
      console.error(' Error saving notes:', error);
      showNotification('error', `Failed to save notes: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTask = async () => {
    try {
      if (!taskTitle || !taskDescription || !taskDueDate) {
        showNotification('error', 'Please fill in all task fields');
        return;
      }

      setSaving(true);
      console.log(' Saving task:', { sessionId, patientId, title: taskTitle });

      const response = await fetch(`${API_BASE_URL}/session-tools/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId,
          patientId,
          title: taskTitle,
          description: taskDescription,
          dueDate: taskDueDate,
          priority: taskPriority
        })
      });

      console.log(' Task response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error(' Task error:', errorData);
        throw new Error(errorData.message || 'Failed to create task');
      }

      const result = await response.json();
      console.log(' Task saved:', result);

      showNotification('success', 'Task created successfully!');
      // Clear form
      setTaskTitle('');
      setTaskDescription('');
      setTaskDueDate('');
      setTaskPriority('medium');
    } catch (error: any) {
      console.error(' Error creating task:', error);
      showNotification('error', `Failed to create task: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="fixed inset-0 z-50 overflow-hidden pointer-events-none">
      {/* Backdrop (invisible or subtle to allow seeing video) */}
      <div
        className={`absolute inset-0 bg-black/20 backdrop-blur-[1px] transition-opacity pointer-events-auto ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Side Drawer */}
      <div
        className={`absolute top-0 right-0 h-full w-full max-w-md bg-white border-l border-gray-100 shadow-2xl transform transition-transform duration-300 ease-in-out pointer-events-auto flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-wide" style={{ fontFamily: 'Bree Serif, serif' }}>
              Session Tools
            </h2>
            <p className="text-sm text-gray-500 mt-1 flex items-center gap-2">
              Patient: <span className="text-teal-600 font-semibold">{patientName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-full transition-all"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Emergency Contact */}
        {emergencyContact && (
          <div className="mx-6 mt-4 p-3 bg-gray-50 border border-gray-100 rounded-xl text-xs text-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p><span className="font-semibold text-gray-900">Emergency Contact:</span> {emergencyContact.name}</p>
                <p><span className="font-semibold text-gray-900">Phone:</span> <a href={`tel:${emergencyContact.phone}`} className="font-bold text-teal-600 hover:underline">{emergencyContact.phone}</a></p>
              </div>
              <button
                onClick={() => window.location.href = `tel:${emergencyContact.phone}`}
                className="px-3 py-1 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 transition-colors"
              >
                Call
              </button>
            </div>
          </div>
        )}

        {/* Notification */}
        {notification && (
          <div className={`mx-6 mt-4 p-3 rounded-xl text-sm font-medium ${notification.type === 'success' ? 'bg-emerald-50 border border-emerald-100 text-emerald-600' : 'bg-red-50 border border-red-100 text-red-600'}`}>
            {notification.message}
          </div>
        )}

        {/* Tabs - Pill Style */}
        <div className="px-6 py-4">
          <div className="flex bg-gray-50 p-1 rounded-xl">
            {(['notes', 'tasks', 'chat'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200 capitalize ${activeTab === tab
                  ? 'bg-white text-teal-600 shadow-sm border border-gray-100'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className={`flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar ${activeTab === 'chat' ? 'flex flex-col' : ''}`}>
          {/* NOTES TAB */}
          {activeTab === 'notes' && (
            <div className="space-y-5 animate-fadeIn">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Session Notes</label>
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Type observations here..."
                  className="w-full h-48 p-4 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all resize-none leading-relaxed"
                />
              </div>

              <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
                <p className="text-xs font-bold text-teal-600 mb-2 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  REMEMBER TO INCLUDE
                </p>
                <div className="flex flex-wrap gap-2">
                  {['Mood', 'Topics', 'Progress', 'Techniques'].map(tag => (
                    <span key={tag} className="text-[10px] bg-teal-100 text-teal-700 px-2 py-1 rounded-md border border-teal-200">{tag}</span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Mood</label>
                  <input
                    type="text"
                    value={mood}
                    onChange={(e) => setMood(e.target.value)}
                    placeholder="e.g. Anxious"
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Topics</label>
                  <input
                    type="text"
                    value={topicsDiscussed}
                    onChange={(e) => setTopicsDiscussed(e.target.value)}
                    placeholder="e.g. Work"
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Progress & Insights</label>
                <textarea
                  value={progressInsights}
                  onChange={(e) => setProgressInsights(e.target.value)}
                  placeholder="Key insights..."
                  className="w-full h-24 p-3 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Techniques Used</label>
                <input
                  type="text"
                  value={therapeuticTechniques}
                  onChange={(e) => setTherapeuticTechniques(e.target.value)}
                  placeholder="e.g. CBT, Breathwork"
                  className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
                />
              </div>
            </div>
          )}

          {/* TASKS TAB */}
          {activeTab === 'tasks' && (
            <div className="space-y-5 animate-fadeIn">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Task Title</label>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="What needs to be done?"
                  className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Description</label>
                <textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  placeholder="Details..."
                  className="w-full h-32 p-3 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Due Date</label>
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all icon-white"
                    style={{ colorScheme: 'light' }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Priority</label>
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value as any)}
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
            </div>
          )}


          {/* CHAT TAB */}
          {activeTab === 'chat' && (
            <div className="h-full animate-fadeIn flex flex-col">
              <SessionChat targetUserId={patientId} targetUserName={patientName} />
            </div>
          )}
        </div>

        {/* Footer - Hide if Chat is active */}
        {activeTab !== 'chat' && (
          <div className="px-6 py-5 border-t border-gray-100 bg-gray-50/50 backdrop-blur-md flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (activeTab === 'notes') handleSaveNotes();
                else if (activeTab === 'tasks') handleSaveTask();
              }}
              disabled={saving}
              className="px-8 py-2.5 bg-gradient-to-r from-teal-600 to-teal-500 text-white text-sm font-bold rounded-xl shadow-lg hover:shadow-teal-500/20 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  Saving...
                </span>
              ) : (
                activeTab === 'tasks' ? 'Allot Task' : 'Save Notes'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionToolsModal;
