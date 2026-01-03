import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMenu } from 'react-icons/fi';

interface Patient {
  _id: string;
  name: string;
  occupation: string;
  issue: string;
  totalSessions: number;
  email?: string;
}

const PatientDetailsPage: React.FC = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5001/api' 
    : 'https://veraawell-backend.onrender.com/api';

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`${API_BASE_URL}/patients/doctor-patients`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setPatients(data);
    } catch (error) {
      console.error('Error fetching patients:', error);
      // Show empty state on error
      setPatients([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#E0EAEA' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-400 mx-auto"></div>
          <p className="mt-4 text-gray-600" style={{ fontFamily: 'Bree Serif, serif' }}>Loading patient details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#E0EAEA' }}>
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
              onClick={() => { navigate('/doctor-dashboard'); setSidebarOpen(false); }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span className="text-base font-medium">My Dashboard</span>
            </div>
            
            <div 
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
              onClick={() => { navigate('/patient-details'); setSidebarOpen(false); }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span className="text-base font-medium">My Patients</span>
            </div>
            
            <div 
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
              onClick={() => { navigate('/call-history'); setSidebarOpen(false); }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <span className="text-base font-medium">Call History</span>
            </div>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="py-6 px-4 shadow-md" style={{ backgroundColor: '#6DBEDF' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            <FiMenu className="w-6 h-6" />
          </button>
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Bree Serif, serif' }}>Patient Details</h1>
          <div className="w-10"></div>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Table Header */}
          <div className="grid grid-cols-4 gap-6 px-8 py-4 font-bold text-xl text-black" style={{ backgroundColor: '#B8E6E6', fontFamily: 'Bree Serif, serif' }}>
            <div className="text-left">Name</div>
            <div className="text-center">Occupation</div>
            <div className="text-center">Issue</div>
            <div className="text-center">Total Sessions</div>
          </div>

          {/* Table Body */}
          <div>
            {patients.length === 0 ? (
              <div className="py-16 text-center bg-white">
                <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <p className="text-xl text-gray-500" style={{ fontFamily: 'Bree Serif, serif' }}>No patients found</p>
                <p className="text-gray-400 mt-2">Your patient list will appear here once you have sessions</p>
              </div>
            ) : (
              patients.map((patient, index) => (
                <div 
                  key={patient._id}
                  className="grid grid-cols-4 gap-6 px-8 py-4 hover:opacity-90 transition-opacity cursor-pointer"
                  style={{ 
                    backgroundColor: index % 2 === 0 ? '#D4F1F1' : '#FFFFFF',
                    fontFamily: 'Bree Serif, serif'
                  }}
                  onClick={() => {
                    // TODO: Navigate to individual patient detail page
                    console.log('View patient details:', patient._id);
                  }}
                >
                  <div className="text-left font-semibold text-black text-lg">{patient.name}</div>
                  <div className="text-center text-black text-lg">{patient.occupation}</div>
                  <div className="text-center text-black text-lg">{patient.issue}</div>
                  <div className="text-center font-bold text-black text-lg">{patient.totalSessions}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientDetailsPage;
