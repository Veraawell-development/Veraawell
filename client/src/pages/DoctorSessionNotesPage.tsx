import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMenu, FiFileText } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';

interface PatientNote {
  _id: string;
  patientName: string;
  lastDate: string;
  patientId: string;
}

const DoctorSessionNotesPage: React.FC = () => {
  const [notes, setNotes] = useState<PatientNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5001/api' 
    : 'https://veraawell-backend.onrender.com/api';

  useEffect(() => {
    fetchNotes();
  }, []);

  const fetchNotes = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      console.log('📝 Fetching session notes for doctor:', user.userId);
      
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`${API_BASE_URL}/session-tools/notes/doctor/${user.userId}`, {
        credentials: 'include',
        headers
      });

      if (!response.ok) {
        throw new Error('Failed to fetch notes');
      }

      const allNotes = await response.json();
      console.log('📝 Notes fetched:', allNotes.length);

      // Group notes by patient
      const patientMap = new Map<string, { patientName: string; lastDate: Date; patientId: string }>();
      
      allNotes.forEach((note: any) => {
        const patientId = note.patientId?._id || note.patientId;
        const patientName = `${note.patientId?.firstName || ''} ${note.patientId?.lastName || ''}`.trim();
        const noteDate = new Date(note.createdAt);
        
        if (!patientMap.has(patientId) || noteDate > patientMap.get(patientId)!.lastDate) {
          patientMap.set(patientId, {
            patientName: patientName || 'Unknown Patient',
            lastDate: noteDate,
            patientId
          });
        }
      });

      // Convert to array and format dates
      const groupedNotes: PatientNote[] = Array.from(patientMap.entries()).map(([id, data]) => ({
        _id: id,
        patientName: data.patientName,
        lastDate: formatDate(data.lastDate),
        patientId: data.patientId
      }));

      // Sort by last date (most recent first)
      groupedNotes.sort((a, b) => {
        const dateA = new Date(a.lastDate);
        const dateB = new Date(b.lastDate);
        return dateB.getTime() - dateA.getTime();
      });

      setNotes(groupedNotes);
    } catch (error) {
      console.error('Error fetching notes:', error);
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
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#E0EAEA' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-orange-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-serif">Loading session notes...</p>
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
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors" onClick={() => { navigate('/doctor-session-notes'); setSidebarOpen(false); }}>
              <span className="text-base font-medium">Session Notes</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: '#ABA5D1' }}>
        <div className="px-6 py-4 flex items-center justify-center relative">
          <button onClick={() => setSidebarOpen(true)} className="absolute left-6 text-white hover:text-gray-200">
            <FiMenu className="w-8 h-8" />
          </button>
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Bree Serif, serif' }}>Session Notes</h1>
        </div>
      </div>

      <div className="px-6 py-8 max-w-7xl mx-auto">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
          <div className="grid grid-cols-3 gap-6 px-8 py-5 font-bold text-xl" style={{ backgroundColor: '#E8E5F0', fontFamily: 'Bree Serif, serif', color: '#000000' }}>
            <div className="text-center">Name</div>
            <div className="text-center">Last Date</div>
            <div className="text-center">My Notes</div>
          </div>

          <div>
            {notes.map((note, index) => (
              <div 
                key={note._id} 
                className="grid grid-cols-3 gap-6 px-8 py-6 items-center transition-colors hover:bg-gray-50"
                style={{ 
                  backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#F8F8F8',
                  borderBottom: index < notes.length - 1 ? '1px solid #E0E0E0' : 'none'
                }}
              >
                <div className="text-center font-semibold text-lg" style={{ fontFamily: 'Bree Serif, serif', color: '#000000' }}>
                  {note.patientName}
                </div>
                <div className="text-center text-base" style={{ fontFamily: 'Bree Serif, serif', color: '#000000' }}>
                  {note.lastDate}
                </div>
                <div className="flex items-center justify-center gap-3">
                  <FiFileText className="w-5 h-5" style={{ color: '#EF4444' }} />
                  <button 
                    onClick={() => navigate(`/doctor-session-notes/${note.patientId}`)} 
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

export default DoctorSessionNotesPage;
