import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMenu, FiCheckSquare } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';

interface PatientTask {
  _id: string;
  patientName: string;
  lastDate: string;
  tasks: string; // Summary of tasks (e.g. latest title)
  patientId: string;
}

const DoctorTasksPage: React.FC = () => {
  const [tasks, setTasks] = useState<PatientTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:5001/api'
    : 'https://veraawell-backend.onrender.com/api';

  useEffect(() => {
    fetchTasks();
  }, [user]);

  const fetchTasks = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API_BASE_URL}/session-tools/tasks/doctor/${user.userId}`, {
        credentials: 'include',
        headers
      });

      if (!response.ok) throw new Error('Failed to fetch tasks');
      const allTasks = await response.json();

      // Group tasks by patient
      const patientMap = new Map<string, { patientName: string; lastDate: Date; latestTask: string; patientId: string }>();

      allTasks.forEach((task: any) => {
        const patientId = task.patientId?._id || task.patientId;
        const patientName = `${task.patientId?.firstName || ''} ${task.patientId?.lastName || ''}`.trim();
        const taskDate = new Date(task.createdAt); // or task.dueDate

        // We want the LATEST task info
        if (!patientMap.has(patientId) || taskDate > patientMap.get(patientId)!.lastDate) {
          patientMap.set(patientId, {
            patientName: patientName || 'Unknown Patient',
            lastDate: taskDate,
            latestTask: task.title,
            patientId
          });
        }
      });

      // Convert to array
      const groupedTasks: PatientTask[] = Array.from(patientMap.values()).map(data => ({
        _id: data.patientId,
        patientName: data.patientName,
        lastDate: formatDate(data.lastDate),
        tasks: data.latestTask, // Showing truncated title of latest task
        patientId: data.patientId
      }));

      // Sort by date descending
      groupedTasks.sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());

      setTasks(groupedTasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: Date) => {
    const day = date.getDate();
    const month = date.toLocaleString('en-US', { month: 'long' });
    const year = date.getFullYear();
    const suffix = (d: number) => {
      if (d > 3 && d < 21) return 'th';
      switch (d % 10) {
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-gray-500 font-medium">Loading tasks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar - Teal Theme */}
      <div className={`fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 shadow-2xl transform transition-transform duration-300 ease-in-out z-50 bg-white border-r border-gray-100 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
        <div className="h-full flex flex-col p-6">
          <div className="space-y-2">
            <button
              onClick={() => { navigate('/doctor-dashboard'); setSidebarOpen(false); }}
              className="w-full flex items-center space-x-3 px-4 py-3 text-gray-600 hover:bg-teal-50 hover:text-teal-700 rounded-xl transition-all font-medium"
            >
              <span>My Dashboard</span>
            </button>
            <button
              onClick={() => { navigate('/doctor-tasks'); setSidebarOpen(false); }}
              className="w-full flex items-center space-x-3 px-4 py-3 bg-teal-50 text-teal-700 rounded-xl transition-all font-bold shadow-sm"
            >
              <span>Tasks Assigned</span>
            </button>
          </div>
        </div>
      </div>

      {/* Header - Teal Gradient */}
      <div className="bg-[#5DBEBD] text-white shadow-lg relative overflow-hidden">
        <div className="absolute inset-0 bg-white/10 pattern-dots opacity-10"></div>
        <div className="px-6 py-6 flex items-center justify-center relative z-10">
          <button onClick={() => setSidebarOpen(true)} className="absolute left-6 text-white hover:bg-white/20 p-2 rounded-full transition-colors">
            <FiMenu className="w-6 h-6" />
          </button>
          <h1 className="text-2xl md:text-3xl font-bold tracking-wide" style={{ fontFamily: 'Bree Serif, serif' }}>Tasks Assigned</h1>
        </div>
      </div>

      <div className="px-4 py-8 max-w-6xl mx-auto">
        {tasks.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-gray-100">
            <div className="bg-teal-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <FiCheckSquare className="w-8 h-8 text-teal-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2 font-serif">No Tasks Assigned</h3>
            <p className="text-gray-500">You haven't assigned any tasks yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-teal-50/50 border-b border-teal-100 text-teal-900 font-bold text-sm uppercase tracking-wider">
              <div className="col-span-4 pl-4">Patient Name</div>
              <div className="col-span-3 text-center">Last Date</div>
              <div className="col-span-3 hidden md:block">Latest Task</div>
              <div className="col-span-2 text-center">Action</div>
            </div>

            <div className="divide-y divide-gray-100">
              {tasks.map((task) => (
                <div
                  key={task._id}
                  className="grid grid-cols-12 gap-4 px-6 py-5 items-center hover:bg-gray-50 transition-colors group"
                >
                  <div className="col-span-4 pl-4">
                    <span className="font-bold text-gray-800 text-lg group-hover:text-teal-700 transition-colors" style={{ fontFamily: 'Bree Serif, serif' }}>
                      {task.patientName}
                    </span>
                  </div>
                  <div className="col-span-3 text-center">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600">
                      {task.lastDate}
                    </span>
                  </div>
                  <div className="col-span-3 hidden md:block text-gray-500 text-sm truncate pr-4">
                    {task.tasks}
                  </div>
                  <div className="col-span-2 flex justify-center">
                    <button
                      onClick={() => navigate(`/doctor-tasks/${task.patientId}`)}
                      className="flex items-center gap-2 text-teal-600 font-bold hover:text-teal-800 hover:underline decoration-2 underline-offset-4 transition-all"
                      style={{ fontFamily: 'Bree Serif, serif' }}
                    >
                      <span className="hidden md:inline">View Details</span>
                      <span className="md:inline lg:hidden">View</span>
                    </button>
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

export default DoctorTasksPage;
