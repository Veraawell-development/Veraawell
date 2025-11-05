import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMenu } from 'react-icons/fi';

interface PatientTask {
  _id: string;
  patientName: string;
  lastDate: string;
  tasks: string;
  patientId: string;
}

const DoctorTasksPage: React.FC = () => {
  const [tasks, setTasks] = useState<PatientTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      // Mock data
      const mockTasks: PatientTask[] = [
        { _id: '1', patientName: 'Arun Sharma', lastDate: '25th September 2025', tasks: 'Excersie Everyday, Do some painting', patientId: 'p1' },
        { _id: '2', patientName: 'Anjali Srivastav', lastDate: '25th September 2025', tasks: 'Excersie Everyday, Do some painting', patientId: 'p2' },
        { _id: '3', patientName: 'Arun Sharma', lastDate: '25th September 2025', tasks: 'Excersie Everyday, Do some painting', patientId: 'p3' },
        { _id: '4', patientName: 'Arun Sharma', lastDate: '25th September 2025', tasks: 'Excersie Everyday, Do some painting', patientId: 'p4' },
        { _id: '5', patientName: 'Arun Sharma', lastDate: '25th September 2025', tasks: 'Excersie Everyday, Do some painting', patientId: 'p5' },
        { _id: '6', patientName: 'Arun Sharma', lastDate: '25th September 2025', tasks: 'Excersie Everyday, Do some painting', patientId: 'p6' },
        { _id: '7', patientName: 'Arun Sharma', lastDate: '25th September 2025', tasks: 'Excersie Everyday, Do some painting', patientId: 'p7' }
      ];
      setTasks(mockTasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#E0EAEA' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-cyan-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-serif">Loading tasks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#E0EAEA' }}>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setSidebarOpen(false)} />
      )}

      <div className={`fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 shadow-lg transform transition-transform duration-300 ease-in-out z-50 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`} style={{ backgroundColor: '#7DA9A8' }}>
        <div className="h-full flex flex-col p-4 text-white font-serif">
          <div className="space-y-3 mb-6">
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors" onClick={() => { navigate('/doctor-dashboard'); setSidebarOpen(false); }}>
              <span className="text-base font-medium">My Dashboard</span>
            </div>
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors" onClick={() => { navigate('/doctor-tasks'); setSidebarOpen(false); }}>
              <span className="text-base font-medium">Tasks Assigned</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: '#ABA5D1' }}>
        <div className="px-6 py-4 flex items-center justify-center relative">
          <button onClick={() => setSidebarOpen(true)} className="absolute left-6 text-white hover:text-gray-200">
            <FiMenu className="w-8 h-8" />
          </button>
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Bree Serif, serif' }}>Tasks Assigned</h1>
        </div>
      </div>

      <div className="px-6 py-8 max-w-7xl mx-auto">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
          <div className="grid grid-cols-4 gap-6 px-8 py-5 font-bold text-xl" style={{ backgroundColor: '#E8E5F0', fontFamily: 'Bree Serif, serif', color: '#000000' }}>
            <div className="text-center">Name</div>
            <div className="text-center">Last Date</div>
            <div className="text-center">Tasks</div>
            <div className="text-center">View All</div>
          </div>

          <div>
            {tasks.map((task, index) => (
              <div 
                key={task._id} 
                className="grid grid-cols-4 gap-6 px-8 py-6 items-center transition-colors hover:bg-gray-50"
                style={{ 
                  backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#F8F8F8',
                  borderBottom: index < tasks.length - 1 ? '1px solid #E0E0E0' : 'none'
                }}
              >
                <div className="text-center font-semibold text-lg" style={{ fontFamily: 'Bree Serif, serif', color: '#000000' }}>
                  {task.patientName}
                </div>
                <div className="text-center text-base" style={{ fontFamily: 'Bree Serif, serif', color: '#000000' }}>
                  {task.lastDate}
                </div>
                <div className="text-center text-base" style={{ fontFamily: 'Bree Serif, serif', color: '#000000' }}>
                  {task.tasks}
                </div>
                <div className="text-center">
                  <button 
                    onClick={() => navigate(`/doctor-tasks/${task.patientId}`)} 
                    className="text-base font-bold underline hover:opacity-70 transition-opacity"
                    style={{ fontFamily: 'Bree Serif, serif', color: '#000000' }}
                  >
                    View All
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoctorTasksPage;
