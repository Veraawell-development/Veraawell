import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMenu, FiDownload } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';

interface PatientReport {
  _id: string;
  patientName: string;
  lastDate: string;
  patientId: string;
}

const DoctorReportsPage: React.FC = () => {
  const [reports, setReports] = useState<PatientReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5001/api' 
    : 'https://veraawell-backend.onrender.com/api';

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      console.log('📄 Fetching reports for doctor:', user.userId);
      
      const response = await fetch(`${API_BASE_URL}/session-tools/reports/doctor/${user.userId}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch reports');
      }

      const allReports = await response.json();
      console.log('📄 Reports fetched:', allReports.length);

      // Group reports by patient
      const patientMap = new Map<string, { patientName: string; lastDate: Date; patientId: string }>();
      
      allReports.forEach((report: any) => {
        const patientId = report.patientId?._id || report.patientId;
        const patientName = `${report.patientId?.firstName || ''} ${report.patientId?.lastName || ''}`.trim();
        const reportDate = new Date(report.createdAt);
        
        if (!patientMap.has(patientId) || reportDate > patientMap.get(patientId)!.lastDate) {
          patientMap.set(patientId, {
            patientName: patientName || 'Unknown Patient',
            lastDate: reportDate,
            patientId
          });
        }
      });

      // Convert to array and format dates
      const groupedReports: PatientReport[] = Array.from(patientMap.entries()).map(([id, data]) => ({
        _id: id,
        patientName: data.patientName,
        lastDate: formatDate(data.lastDate),
        patientId: data.patientId
      }));

      // Sort by last date (most recent first)
      groupedReports.sort((a, b) => {
        const dateA = new Date(a.lastDate);
        const dateB = new Date(b.lastDate);
        return dateB.getTime() - dateA.getTime();
      });

      setReports(groupedReports);
    } catch (error) {
      console.error('Error fetching reports:', error);
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
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-serif">Loading reports...</p>
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
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors" onClick={() => { navigate('/patient-details'); setSidebarOpen(false); }}>
              <span className="text-base font-medium">My Patients</span>
            </div>
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors" onClick={() => { navigate('/doctor-reports'); setSidebarOpen(false); }}>
              <span className="text-base font-medium">Reports</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: '#ABA5D1' }}>
        <div className="px-6 py-4 flex items-center justify-center relative">
          <button onClick={() => setSidebarOpen(true)} className="absolute left-6 text-white hover:text-gray-200">
            <FiMenu className="w-8 h-8" />
          </button>
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Bree Serif, serif' }}>Reports</h1>
        </div>
      </div>

      <div className="px-6 py-8 max-w-7xl mx-auto">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
          <div className="grid grid-cols-3 gap-6 px-8 py-5 font-bold text-xl" style={{ backgroundColor: '#E8E5F0', fontFamily: 'Bree Serif, serif', color: '#000000' }}>
            <div className="text-center">Name</div>
            <div className="text-center">Last Date</div>
            <div className="text-center">Reports</div>
          </div>

          <div>
            {reports.map((report, index) => (
              <div 
                key={report._id} 
                className="grid grid-cols-3 gap-6 px-8 py-6 items-center transition-colors hover:bg-gray-50"
                style={{ 
                  backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#F8F8F8',
                  borderBottom: index < reports.length - 1 ? '1px solid #E0E0E0' : 'none'
                }}
              >
                <div className="text-center font-semibold text-lg" style={{ fontFamily: 'Bree Serif, serif', color: '#000000' }}>
                  {report.patientName}
                </div>
                <div className="text-center text-base" style={{ fontFamily: 'Bree Serif, serif', color: '#000000' }}>
                  {report.lastDate}
                </div>
                <div className="flex items-center justify-center gap-3">
                  <FiDownload className="w-5 h-5" style={{ color: '#EF4444' }} />
                  <button 
                    onClick={() => navigate(`/doctor-reports/${report.patientId}`)} 
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

export default DoctorReportsPage;
