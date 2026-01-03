import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiMenu, FiCheckSquare, FiArrowLeft, FiCalendar, FiFlag } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';

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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [patientName, setPatientName] = useState('');
  const navigate = useNavigate();
  const { patientId } = useParams();
  const { user } = useAuth();

  const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:5001/api'
    : 'https://veraawell-backend.onrender.com/api';

  useEffect(() => {
    fetchPatientTasks();
  }, [patientId, user]);

  const fetchPatientTasks = async () => {
    if (!patientId || !user) return;

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API_BASE_URL}/session-tools/tasks/patient/${patientId}`, {
        credentials: 'include',
        headers
      });

      if (!response.ok) throw new Error('Failed to fetch patient tasks');
      const data = await response.json();

      setTasks(data);
      if (data.length > 0 && data[0].patientId) {
        setPatientName(`${data[0].patientId.firstName} ${data[0].patientId.lastName}`);
      }
    } catch (error) {
      console.error('Error fetching patient tasks:', error);
    } finally {
      setLoading(false);
    }
  };

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
              <span>Back to List</span>
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
          <h1 className="text-2xl md:text-3xl font-bold tracking-wide" style={{ fontFamily: 'Bree Serif, serif' }}>
            {patientName ? `${patientName}'s Tasks` : 'Patient Tasks'}
          </h1>
        </div>
      </div>

      <div className="px-4 py-8 max-w-5xl mx-auto">
        <div className="flex items-center mb-6">
          <button
            onClick={() => navigate('/doctor-tasks')}
            className="flex items-center text-teal-600 hover:text-teal-800 font-medium transition-colors"
          >
            <FiArrowLeft className="mr-2" /> Back to All Patients
          </button>
        </div>

        {tasks.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-gray-100">
            <div className="bg-teal-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <FiCheckSquare className="w-8 h-8 text-teal-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2 font-serif">No Tasks Found</h3>
            <p className="text-gray-500">No tasks assigned to this patient yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {tasks.map((task) => (
              <div
                key={task._id}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all p-6 relative overflow-hidden group"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-teal-50 rounded-full -mr-16 -mt-16 opacity-50 group-hover:opacity-100 transition-opacity"></div>

                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-800 mb-1" style={{ fontFamily: 'Bree Serif, serif' }}>
                        {task.title}
                      </h3>
                      <p className="text-gray-500 text-sm flex items-center gap-2">
                        <FiCalendar className="w-4 h-4" />
                        Due: {formatDate(task.dueDate)}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border flex items-center gap-1 ${getPriorityColor(task.priority)}`}>
                      <FiFlag className="w-3 h-3" />
                      {task.priority}
                    </span>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 text-gray-700">
                    {task.description ? (
                      <p className="whitespace-pre-wrap">{task.description}</p>
                    ) : (
                      <p className="italic text-gray-400">No additional description.</p>
                    )}
                  </div>

                  <div className="mt-4 flex justify-end">
                    <span className={`text-sm font-medium ${task.status === 'completed' ? 'text-green-600' : 'text-amber-600'}`}>
                      Status: {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DoctorTasksDetailPage;
