import React, { useState, useEffect } from 'react';
import SessionChat from './SessionChat';
import { API_BASE_URL } from '../config/api';

interface SessionToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  patientId: string;
  patientName: string;
  onNewMessage?: () => void;
}

const SessionToolsModal: React.FC<SessionToolsModalProps> = ({
  isOpen,
  onClose,
  sessionId,
  patientId,
  patientName,
  onNewMessage
}) => {
  const [activeTab, setActiveTab] = useState<'notes' | 'tasks' | 'chat'>('notes');
  const [saving, setSaving] = useState(false);
  const [emergencyContact, setEmergencyContact] = useState<{ name: string; phone: string } | null>(null);
  const [hasUnreadTabMessages, setHasUnreadTabMessages] = useState(false);

  useEffect(() => {
    if (activeTab === 'chat') {
      setHasUnreadTabMessages(false);
    }
  }, [activeTab]);

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

      {/* Floating Side Panel */}
      <div
        className={`absolute top-4 right-4 bottom-4 w-full max-w-md bg-[#18181B]/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_0_40px_rgba(0,0,0,0.8)] transform transition-transform duration-300 ease-in-out pointer-events-auto flex flex-col overflow-hidden ${isOpen ? 'translate-x-0' : 'translate-x-[120%]'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-white/5">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-wide" style={{ fontFamily: 'Inter, sans-serif' }}>
              Session Tools
            </h2>
            <p className="text-sm text-white/60 mt-1 flex items-center gap-2 font-medium">
              Patient: <span className="text-white/90">{patientName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white hover:bg-white/10 p-2 rounded-full transition-all"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Emergency Contact */}
        {emergencyContact && (
          <div className="px-6 py-3 bg-red-500/5 border-b border-red-500/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">Emergency</span>
              <span className="text-white/80 text-sm font-medium">{emergencyContact.name} <span className="text-white/30 mx-1">&bull;</span> {emergencyContact.phone}</span>
            </div>
            <button
              onClick={() => window.location.href = `tel:${emergencyContact.phone}`}
              className="text-red-400 hover:text-red-300 text-sm font-bold tracking-wide transition-colors"
            >
              Call
            </button>
          </div>
        )}

        {/* Notification */}
        {notification && (
          <div className={`px-6 py-3 text-sm font-medium border-b ${notification.type === 'success' ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400' : 'bg-red-500/5 border-red-500/10 text-red-400'}`}>
            {notification.message}
          </div>
        )}

        {/* Tabs - Minimal Line Style */}
        <div className="px-6 pt-4 flex gap-8 border-b border-white/5">
          {(['notes', 'tasks', 'chat'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-4 text-sm font-semibold capitalize transition-all outline-none focus:outline-none relative ${activeTab === tab
                  ? 'text-white'
                  : 'text-white/40 hover:text-white/70'
                }`}
            >
              <div className="flex items-center gap-1.5">
                {tab}
                {tab === 'chat' && hasUnreadTabMessages && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                )}
              </div>
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white rounded-t-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"></div>
              )}
            </button>
          ))}
        </div>

        {/* Content - Scrollable */}
        <div className={`flex-1 overflow-y-auto custom-scrollbar ${activeTab === 'chat' ? 'flex flex-col bg-black/20' : 'px-6 pb-6'}`}>
          {/* NOTES TAB */}
          {activeTab === 'notes' && (
              <div className="space-y-8 animate-fadeIn pt-4">
                <div>
                  <textarea
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="Session observations..."
                    className="w-full h-40 bg-transparent border-none text-white/90 placeholder-white/20 focus:ring-0 outline-none focus:outline-none resize-none text-base leading-relaxed p-0"
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                  <span className="text-[10px] uppercase font-bold text-white/30 mr-2 self-center tracking-widest">Include:</span>
                  {['Mood', 'Topics', 'Progress', 'Techniques'].map(tag => (
                    <span key={tag} className="text-[10px] uppercase font-bold tracking-widest text-white/50 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">{tag}</span>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-x-8 gap-y-8 pt-4 border-t border-white/5">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">Mood</label>
                    <input
                      type="text"
                      value={mood}
                      onChange={(e) => setMood(e.target.value)}
                      placeholder="e.g. Anxious"
                      className="w-full bg-transparent border-0 border-b border-white/10 text-white/90 placeholder-white/20 focus:border-white focus:ring-0 outline-none focus:outline-none py-2 px-0 transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">Topics</label>
                    <input
                      type="text"
                      value={topicsDiscussed}
                      onChange={(e) => setTopicsDiscussed(e.target.value)}
                      placeholder="e.g. Work"
                      className="w-full bg-transparent border-0 border-b border-white/10 text-white/90 placeholder-white/20 focus:border-white focus:ring-0 outline-none focus:outline-none py-2 px-0 transition-all text-sm"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">Progress & Insights</label>
                  <textarea
                    value={progressInsights}
                    onChange={(e) => setProgressInsights(e.target.value)}
                    placeholder="Key insights..."
                    className="w-full h-20 bg-transparent border-0 border-b border-white/10 text-white/90 placeholder-white/20 focus:border-white focus:ring-0 outline-none focus:outline-none py-2 px-0 transition-all resize-none text-sm"
                  />
                </div>

                <div className="pt-2">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">Techniques Used</label>
                  <input
                    type="text"
                    value={therapeuticTechniques}
                    onChange={(e) => setTherapeuticTechniques(e.target.value)}
                    placeholder="e.g. CBT, Breathwork"
                    className="w-full bg-transparent border-0 border-b border-white/10 text-white/90 placeholder-white/20 focus:border-white focus:ring-0 outline-none focus:outline-none py-2 px-0 transition-all text-sm"
                  />
                </div>
              </div>
          )}

          {/* TASKS TAB */}
          {activeTab === 'tasks' && (
            <div className="space-y-8 animate-fadeIn pt-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">Task Title</label>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="What needs to be done?"
                  className="w-full bg-transparent border-0 border-b border-white/10 text-white/90 placeholder-white/20 focus:border-white focus:ring-0 outline-none focus:outline-none py-2 px-0 transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">Description</label>
                <textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  placeholder="Details..."
                  className="w-full h-32 bg-transparent border-0 border-b border-white/10 text-white/90 placeholder-white/20 focus:border-white focus:ring-0 outline-none focus:outline-none py-2 px-0 transition-all resize-none text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-x-8 gap-y-8">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">Due Date</label>
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="w-full bg-transparent border-0 border-b border-white/10 text-white/90 focus:border-white focus:ring-0 outline-none focus:outline-none py-2 px-0 transition-all icon-white text-sm"
                    style={{ colorScheme: 'dark' }}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">Priority</label>
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value as any)}
                    className="w-full bg-transparent border-0 border-b border-white/10 text-white/90 focus:border-white focus:ring-0 outline-none focus:outline-none py-2 px-0 transition-all text-sm [&>option]:bg-[#18181B]"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
            </div>
          )}


          {/* CHAT TAB - Always mount so it receives messages */}
          <div className={`h-full flex-col ${activeTab === 'chat' ? 'flex animate-fadeIn' : 'hidden'}`}>
            <SessionChat 
              targetUserId={patientId} 
              targetUserName={patientName} 
              onNewMessage={() => {
                if (activeTab !== 'chat') setHasUnreadTabMessages(true);
                if (onNewMessage) onNewMessage();
              }} 
            />
          </div>
        </div>

        {/* Footer - Hide if Chat is active */}
        {activeTab !== 'chat' && (
          <div className="px-6 py-5 border-t border-white/10 bg-black/20 backdrop-blur-md flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-semibold text-white/50 hover:text-white/80 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (activeTab === 'notes') handleSaveNotes();
                else if (activeTab === 'tasks') handleSaveTask();
              }}
              disabled={saving}
              className="px-8 py-2.5 bg-white text-black text-sm font-bold rounded-xl shadow-lg hover:bg-gray-200 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-black" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
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
