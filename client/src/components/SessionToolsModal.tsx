import React, { useState } from 'react';

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
  const [activeTab, setActiveTab] = useState<'notes' | 'tasks' | 'report'>('notes');
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
      console.log('📝 Saving notes:', { sessionId, patientId });
      
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

      console.log('📝 Notes response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('📝 Notes error:', errorData);
        throw new Error(errorData.message || 'Failed to save notes');
      }

      const result = await response.json();
      console.log('✅ Notes saved:', result);

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
      console.log('✅ Saving task:', { sessionId, patientId, title: taskTitle });
      
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

      console.log('✅ Task response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('✅ Task error:', errorData);
        throw new Error(errorData.message || 'Failed to create task');
      }

      const result = await response.json();
      console.log('✅ Task saved:', result);

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
      console.log('📝 Saving report:', { sessionId, patientId, title: reportTitle });
      
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

      console.log('📝 Report response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('📝 Report error:', errorData);
        throw new Error(errorData.message || 'Failed to create report');
      }

      const result = await response.json();
      console.log('✅ Report saved:', result);
      
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ backgroundColor: '#5DBEBD' }}>
          <h2 className="text-2xl font-bold text-white" style={{ fontFamily: 'Bree Serif, serif' }}>
            Session Tools
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-full transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Patient Info */}
        <div className="px-6 py-3 bg-gray-50 border-b">
          <p className="text-sm text-gray-600">Patient: <span className="font-semibold text-gray-800">{patientName}</span></p>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('notes')}
            className={`flex-1 py-3 text-center font-medium transition-colors ${
              activeTab === 'notes'
                ? 'text-teal-600 border-b-2 border-teal-600 bg-teal-50'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
            }`}
            style={{ fontFamily: 'Bree Serif, serif' }}
          >
            Notes
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex-1 py-3 text-center font-medium transition-colors ${
              activeTab === 'tasks'
                ? 'text-teal-600 border-b-2 border-teal-600 bg-teal-50'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
            }`}
            style={{ fontFamily: 'Bree Serif, serif' }}
          >
            Tasks
          </button>
          <button
            onClick={() => setActiveTab('report')}
            className={`flex-1 py-3 text-center font-medium transition-colors ${
              activeTab === 'report'
                ? 'text-teal-600 border-b-2 border-teal-600 bg-teal-50'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
            }`}
            style={{ fontFamily: 'Bree Serif, serif' }}
          >
            Report
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* NOTES TAB */}
          {activeTab === 'notes' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Session Notes</label>
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Document key observations, patient responses, therapeutic interventions..."
                  className="w-full h-40 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                  style={{ fontFamily: 'Bree Serif, serif' }}
                />
              </div>

              <div className="text-sm text-gray-600 space-y-2">
                <p className="font-medium">💡 Include:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Patient's mood and behavior</li>
                  <li>Topics discussed</li>
                  <li>Progress and insights</li>
                  <li>Therapeutic techniques used</li>
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Mood</label>
                  <input
                    type="text"
                    value={mood}
                    onChange={(e) => setMood(e.target.value)}
                    placeholder="e.g., Anxious, Calm, Hopeful"
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Topics Discussed</label>
                  <input
                    type="text"
                    value={topicsDiscussed}
                    onChange={(e) => setTopicsDiscussed(e.target.value)}
                    placeholder="e.g., Work stress, Family"
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Progress & Insights</label>
                <textarea
                  value={progressInsights}
                  onChange={(e) => setProgressInsights(e.target.value)}
                  placeholder="Patient's progress and key insights..."
                  className="w-full h-24 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Therapeutic Techniques</label>
                <input
                  type="text"
                  value={therapeuticTechniques}
                  onChange={(e) => setTherapeuticTechniques(e.target.value)}
                  placeholder="e.g., CBT, Mindfulness, Breathing exercises"
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          )}

          {/* TASKS TAB */}
          {activeTab === 'tasks' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Task Title *</label>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="e.g., Practice mindfulness meditation"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  style={{ fontFamily: 'Bree Serif, serif' }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
                <textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  placeholder="Detailed instructions for the task..."
                  className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 resize-none"
                  style={{ fontFamily: 'Bree Serif, serif' }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Due Date *</label>
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value as 'low' | 'medium' | 'high')}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
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
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Report Title *</label>
                <input
                  type="text"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  placeholder="e.g., Progress Assessment - Week 4"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  style={{ fontFamily: 'Bree Serif, serif' }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Report Type</label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as any)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                >
                  <option value="assessment">Assessment</option>
                  <option value="progress">Progress Report</option>
                  <option value="diagnosis">Diagnosis</option>
                  <option value="treatment-plan">Treatment Plan</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Report Content *</label>
                <textarea
                  value={reportContent}
                  onChange={(e) => setReportContent(e.target.value)}
                  placeholder="Detailed report content..."
                  className="w-full h-64 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 resize-none"
                  style={{ fontFamily: 'Bree Serif, serif' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-6 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            style={{ fontFamily: 'Bree Serif, serif' }}
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
            className="px-6 py-2 text-white rounded-lg transition-colors disabled:opacity-50"
            style={{ 
              backgroundColor: '#5DBEBD',
              fontFamily: 'Bree Serif, serif'
            }}
          >
            {saving ? 'Saving...' : `Save ${activeTab === 'notes' ? 'Notes' : activeTab === 'tasks' ? 'Task' : 'Report'}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionToolsModal;
