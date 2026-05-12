import React, { useState, useEffect } from 'react';
import { FiMenu } from 'react-icons/fi';
import BackToDashboard from '../components/BackToDashboard';
import DoctorSidebar from '../components/DoctorSidebar';
import { API_BASE_URL } from '../config/api';

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
      <DoctorSidebar 
        sidebarOpen={sidebarOpen} 
        setSidebarOpen={setSidebarOpen} 
      />

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
          <BackToDashboard />
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
