import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiCheckSquare, FiArrowLeft, FiCalendar, FiFlag } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '../config/api';

interface Task {
  _id: string;
  title: string;
  description: string;
  dueDate: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'completed';
  patientId: {
    firstName: string;
    lastName: string;
  }
}

const DoctorTasksDetailPage: React.FC = () => {
  const [patientName, setPatientName] = useState('');
  const navigate = useNavigate();
  const { patientId } = useParams();
  const { user } = useAuth();

  const { data: tasks = [], isLoading: loading } = useQuery<Task[]>({
    queryKey: ['doctor', 'tasks', 'patient', patientId],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {};
      const response = await fetch(`${API_BASE_URL}/session-tools/tasks/patient/${patientId}`, {
        credentials: 'include',
        headers
      });
      if (!response.ok) throw new Error('Failed to fetch patient tasks');
      const data = await response.json();
      return data.tasks || [];
    },
    enabled: !!patientId && !!user
  });

  useEffect(() => {
    if (tasks.length > 0 && tasks[0].patientId) {
      setPatientName(`${tasks[0].patientId.firstName || ''} ${tasks[0].patientId.lastName || ''}`.trim());
    }
  }, [tasks]);

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    // Convert UTC to local readable format
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50 border-red-100';
      case 'medium': return 'text-orange-600 bg-orange-50 border-orange-100';
      case 'low': return 'text-green-600 bg-green-50 border-green-100';
      default: return 'text-gray-600 bg-gray-50 border-gray-100';
    }
  };

  if (loading) {
    return (
      <div className="h-[calc(100vh-80px)] flex items-center justify-center bg-[#FAFAFA]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 text-[13px] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>Loading tasks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen pt-[64px] md:pt-[80px] bg-[#FAFAFA] font-sans flex flex-col overflow-hidden box-border">
      {/* Main Content Area */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 md:py-10 flex flex-col min-h-0">
        
        <div className="mb-8 max-w-2xl relative shrink-0">
          <button 
            onClick={() => navigate('/doctor-tasks')} 
            className="flex items-center gap-2 text-[13px] font-semibold text-gray-500 hover:text-teal-600 transition-colors mb-5 group"
            aria-label="Back to All Patients"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to All Patients
          </button>

          <h1 className="text-[32px] md:text-[36px] font-extrabold text-gray-800 tracking-tight mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
            {patientName ? `${patientName}'s Tasks` : 'Patient Tasks'}
          </h1>
          <p className="text-[15px] text-gray-500 font-medium leading-relaxed max-w-2xl" style={{ fontFamily: 'Inter, sans-serif' }}>
            View and monitor all the tasks assigned to this patient.
          </p>
        </div>

        {tasks.length === 0 ? (
          <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm p-16 text-center max-w-3xl mx-auto mt-4 shrink-0">
            <div className="w-16 h-16 bg-gray-50 border border-gray-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <FiCheckSquare className="w-6 h-6 text-gray-400" />
            </div>
            <h3 className="text-[18px] font-bold text-gray-800 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
              No Tasks Found
            </h3>
            <p className="text-gray-500 text-[14px] mb-8" style={{ fontFamily: 'Inter, sans-serif' }}>
              No tasks have been assigned to this patient yet.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2 pb-10 min-h-0">
            <div className="space-y-5 max-w-4xl">
              {tasks.map((task) => (
                <div
                  key={task._id}
                  className="bg-white rounded-[16px] border border-gray-100 hover:border-teal-100 shadow-sm transition-all overflow-hidden p-6 flex flex-col"
                >
                  <div className="flex justify-between items-start mb-5 pb-5 border-b border-gray-50">
                    <div>
                      <h3 className="text-[16px] font-bold text-gray-800 tracking-tight mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {task.title}
                      </h3>
                      <p className="text-[12px] font-medium text-gray-500 flex items-center gap-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                        <FiCalendar className="w-3.5 h-3.5" />
                        Due: {formatDate(task.dueDate)}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold tracking-wide uppercase border ${getPriorityColor(task.priority)}`} style={{ fontFamily: 'Inter, sans-serif' }}>
                      <FiFlag className="w-3 h-3" />
                      {task.priority}
                    </span>
                  </div>
                  
                  <div className="prose prose-sm max-w-none">
                    <div className="text-[14px] leading-relaxed font-medium text-gray-600 bg-gray-50/50 p-5 rounded-xl border border-gray-100" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {task.description ? (
                        <p className="whitespace-pre-wrap">{task.description}</p>
                      ) : (
                        <p className="italic text-gray-400">No additional description.</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 pt-5 border-t border-gray-50 flex justify-end">
                    <span className={`text-[12px] font-bold tracking-wide ${task.status === 'completed' ? 'text-green-600' : 'text-amber-600'}`} style={{ fontFamily: 'Inter, sans-serif' }}>
                      Status: {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DoctorTasksDetailPage;
