import React, { useState } from 'react';
import SessionChat from './SessionChat';

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
  const [activeTab, setActiveTab] = useState<'notes' | 'tasks' | 'report' | 'chat'>('notes');
  const [saving, setSaving] = useState(false);

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

  // Report state
  const [reportTitle, setReportTitle] = useState('');
  const [reportType, setReportType] = useState<'assessment' | 'progress' | 'diagnosis' | 'treatment-plan' | 'other'>('progress');
  const [reportContent, setReportContent] = useState('');

  const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:5001/api'
    : 'https://veraawell-backend.onrender.com/api';

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

      alert('Session notes saved successfully!');
      // Clear form
      setNoteContent('');
      setMood('');
      setTopicsDiscussed('');
      setProgressInsights('');
      setTherapeuticTechniques('');
    } catch (error: any) {
      console.error('❌ Error saving notes:', error);
      alert(`Failed to save notes: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTask = async () => {
    try {
      if (!taskTitle || !taskDescription || !taskDueDate) {
        alert('Please fill in all task fields');
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

      alert('Task created successfully!');
      // Clear form
      setTaskTitle('');
      setTaskDescription('');
      setTaskDueDate('');
      setTaskPriority('medium');
    } catch (error: any) {
      console.error('❌ Error creating task:', error);
      alert(`Failed to create task: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveReport = async () => {
    try {
      if (!reportTitle || !reportContent) {
        alert('Please fill in report title and content');
        return;
      }

      setSaving(true);
      console.log(' Saving report:', { sessionId, patientId, title: reportTitle });

      const response = await fetch(`${API_BASE_URL}/session-tools/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId,
          patientId,
          title: reportTitle,
          reportType,
          content: reportContent,
          isSharedWithPatient: true
        })
      });

      console.log(' Report response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error(' Report error:', errorData);
        throw new Error(errorData.message || 'Failed to create report');
      }

      const result = await response.json();
      console.log(' Report saved:', result);

      alert('Report created successfully!');
      // Clear form
      setReportTitle('');
      setReportContent('');
      setReportType('progress');
    } catch (error: any) {
      console.error('❌ Error creating report:', error);
      alert(`Failed to create report: ${error.message}`);
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
        className={`absolute top-0 right-0 h-full w-full max-w-md bg-gray-900/95 backdrop-blur-xl border-l border-gray-700 shadow-2xl transform transition-transform duration-300 ease-in-out pointer-events-auto flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800/50">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-wide" style={{ fontFamily: 'Bree Serif, serif' }}>
              Session Tools
            </h2>
            <p className="text-sm text-gray-400 mt-1 flex items-center gap-2">
              Patient: <span className="text-teal-400 font-semibold">{patientName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white hover:bg-white/10 p-2 rounded-full transition-all"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs - Pill Style */}
        <div className="px-6 py-4">
          <div className="flex bg-gray-800 p-1 rounded-xl">
            {(['notes', 'tasks', 'report', 'chat'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200 capitalize ${activeTab === tab
                  ? 'bg-teal-600 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
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
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Session Notes</label>
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Type observations here..."
                  className="w-full h-48 p-4 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-200 placeholder-gray-500 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all resize-none leading-relaxed"
                />
              </div>

              <div className="bg-teal-900/20 border border-teal-900/50 rounded-xl p-4">
                <p className="text-xs font-bold text-teal-400 mb-2 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  REMEMBER TO INCLUDE
                </p>
                <div className="flex flex-wrap gap-2">
                  {['Mood', 'Topics', 'Progress', 'Techniques'].map(tag => (
                    <span key={tag} className="text-[10px] bg-teal-900/40 text-teal-300 px-2 py-1 rounded-md border border-teal-800/50">{tag}</span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Mood</label>
                  <input
                    type="text"
                    value={mood}
                    onChange={(e) => setMood(e.target.value)}
                    placeholder="e.g. Anxious"
                    className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Topics</label>
                  <input
                    type="text"
                    value={topicsDiscussed}
                    onChange={(e) => setTopicsDiscussed(e.target.value)}
                    placeholder="e.g. Work"
                    className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Progress & Insights</label>
                <textarea
                  value={progressInsights}
                  onChange={(e) => setProgressInsights(e.target.value)}
                  placeholder="Key insights..."
                  className="w-full h-24 p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Techniques Used</label>
                <input
                  type="text"
                  value={therapeuticTechniques}
                  onChange={(e) => setTherapeuticTechniques(e.target.value)}
                  placeholder="e.g. CBT, Breathwork"
                  className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
                />
              </div>
            </div>
          )}

          {/* TASKS TAB */}
          {activeTab === 'tasks' && (
            <div className="space-y-5 animate-fadeIn">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Task Title</label>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="What needs to be done?"
                  className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Description</label>
                <textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  placeholder="Details..."
                  className="w-full h-32 p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Due Date</label>
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all icon-white"
                    style={{ colorScheme: 'dark' }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Priority</label>
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value as any)}
                    className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* REPORT TAB */}
          {activeTab === 'report' && (
            <div className="space-y-5 animate-fadeIn">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Report Title</label>
                <input
                  type="text"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  placeholder="Report Name..."
                  className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Type</label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as any)}
                  className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
                >
                  <option value="progress">Progress Report</option>
                  <option value="assessment">Assessment</option>
                  <option value="diagnosis">Diagnosis</option>
                  <option value="treatment-plan">Treatment Plan</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Content</label>
                <textarea
                  value={reportContent}
                  onChange={(e) => setReportContent(e.target.value)}
                  placeholder="Write report..."
                  className="w-full h-64 p-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all resize-none"
                />
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
          <div className="px-6 py-5 border-t border-gray-800/50 bg-gray-900/50 backdrop-blur-md flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-semibold text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (activeTab === 'notes') handleSaveNotes();
                else if (activeTab === 'tasks') handleSaveTask();
                else if (activeTab === 'report') handleSaveReport();
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
                `Save ${activeTab === 'notes' ? 'Notes' : activeTab === 'tasks' ? 'Task' : 'Report'}`
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionToolsModal;
