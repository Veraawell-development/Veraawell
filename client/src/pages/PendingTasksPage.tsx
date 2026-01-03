import React, { useState, useEffect } from 'react';
import { FiDownload, FiMenu, FiCheck } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import { formatDate } from '../utils/dateUtils';
import logger from '../utils/logger';
import { useToast } from '../hooks/useToast';
import type { Task } from '../types';

const PendingTasksPage: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();

  useEffect(() => {
    fetchPendingTasks();
  }, []);

  const fetchPendingTasks = async () => {
    try {
      setLoading(true);
      if (!user) return;

      const response = await fetch(`${API_CONFIG.BASE_URL}/session-tools/tasks/patient/${user.userId}?status=pending`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setTasks(data);
    } catch (error) {
      logger.error('Error fetching pending tasks:', error);
      showError('Failed to load tasks');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkComplete = async (taskId: string) => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/session-tools/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'completed' })
      });

      if (!response.ok) throw new Error('Failed to update task');

      showSuccess('Task marked as complete!');
      fetchPendingTasks();
    } catch (error) {
      logger.error('Error updating task:', error);
      showError('Failed to update task');
    }
  };

  const handleDownload = (task: Task) => {
    const content = `${task.title}\n\nDescription:\n${task.description}\n\nDue Date: ${formatDate(task.dueDate)}\nPriority: ${task.priority}\nAssigned by: Dr. ${task.doctorId.firstName} ${task.doctorId.lastName}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Task_${task.title.replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#E0EAEA' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-serif">Loading pending tasks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative bg-white">
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
      <div className="py-4 px-4 shadow-sm" style={{ backgroundColor: '#78BE9F' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            <FiMenu className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Bree Serif, serif' }}>Pending Tasks</h1>
          <div className="w-10"></div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="bg-white border-2 border-gray-300">
          <table className="w-full">
            <thead>
              <tr className="bg-white border-b-2 border-gray-900">
                <th className="py-4 px-6 text-center text-xl font-bold text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>
                  DATE
                </th>
                <th className="py-4 px-6 text-center text-xl font-bold text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>
                  PSYCHOLOGIST
                </th>
                <th className="py-4 px-6 text-center text-xl font-bold text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>
                  DOWNLOADS
                </th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-16 text-center">
                    <p className="text-xl text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>No pending tasks</p>
                    <p className="text-gray-400 mt-2" style={{ fontFamily: 'Inter, sans-serif' }}>Your tasks will appear here</p>
                  </td>
                </tr>
              ) : (
                <>
                  {tasks.map((task) => (
                    <tr 
                      key={task._id}
                      className="border-b border-gray-900"
                    >
                      <td className="py-4 px-6 text-center text-base font-medium text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>
                        {formatDate(task.dueDate)}
                      </td>
                      <td className="py-4 px-6 text-center text-base font-medium text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>
                        Dr. {task.doctorId.firstName} {task.doctorId.lastName}
                      </td>
                      <td className="py-4 px-6 text-center flex gap-2 justify-center">
                        <button
                          onClick={() => handleMarkComplete(task._id)}
                          className="inline-flex items-center gap-2 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm"
                          style={{ fontFamily: 'Bree Serif, serif' }}
                        >
                          <FiCheck className="w-4 h-4" />
                          Complete
                        </button>
                        <button
                          onClick={() => handleDownload(task)}
                          className="inline-flex items-center gap-2 text-base font-semibold text-gray-900 hover:opacity-70 transition-opacity underline"
                          style={{ fontFamily: 'Bree Serif, serif' }}
                        >
                          Download
                          <FiDownload className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {/* Empty rows to match design */}
                  {Array.from({ length: Math.max(0, 6 - tasks.length) }).map((_, index) => (
                    <tr key={`empty-${index}`} className="border-b border-gray-900">
                      <td className="py-6 px-6">&nbsp;</td>
                      <td className="py-6 px-6">&nbsp;</td>
                      <td className="py-6 px-6">&nbsp;</td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PendingTasksPage;
