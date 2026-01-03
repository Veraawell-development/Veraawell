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
      console.log(' Fetching reports for doctor:', user.userId);

      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/session-tools/reports/doctor/${user.userId}`, {
        credentials: 'include',
        headers
      });

      if (!response.ok) {
        throw new Error('Failed to fetch reports');
      }

      const allReports = await response.json();
      console.log(' Reports fetched:', allReports.length);

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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-gray-500 font-medium">Loading reports...</p>
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
              onClick={() => { navigate('/doctor-reports'); setSidebarOpen(false); }}
              className="w-full flex items-center space-x-3 px-4 py-3 bg-teal-50 text-teal-700 rounded-xl transition-all font-bold shadow-sm"
            >
              <span>Reports</span>
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
          <h1 className="text-2xl md:text-3xl font-bold tracking-wide" style={{ fontFamily: 'Bree Serif, serif' }}>Reports</h1>
        </div>
      </div>

      <div className="px-4 py-8 max-w-6xl mx-auto">
        {reports.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-gray-100">
            <div className="bg-teal-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <FiDownload className="w-8 h-8 text-teal-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2 font-serif">No Reports Yet</h3>
            <p className="text-gray-500">You haven't generated any reports yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-teal-50/50 border-b border-teal-100 text-teal-900 font-bold text-sm uppercase tracking-wider">
              <div className="col-span-5 md:col-span-4 pl-4">Patient Name</div>
              <div className="col-span-4 md:col-span-4 text-center">Last Report</div>
              <div className="col-span-3 md:col-span-4 text-center">Action</div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-gray-100">
              {reports.map((report) => (
                <div
                  key={report._id}
                  className="grid grid-cols-12 gap-4 px-6 py-5 items-center hover:bg-gray-50 transition-colors group"
                >
                  <div className="col-span-5 md:col-span-4 pl-4">
                    <span className="font-bold text-gray-800 text-lg group-hover:text-teal-700 transition-colors" style={{ fontFamily: 'Bree Serif, serif' }}>
                      {report.patientName}
                    </span>
                  </div>
                  <div className="col-span-4 md:col-span-4 text-center">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600">
                      {report.lastDate}
                    </span>
                  </div>
                  <div className="col-span-3 md:col-span-4 flex justify-center">
                    <button
                      onClick={() => navigate(`/doctor-reports/${report.patientId}`)}
                      className="flex items-center gap-2 text-teal-600 font-bold hover:text-teal-800 hover:underline decoration-2 underline-offset-4 transition-all"
                      style={{ fontFamily: 'Bree Serif, serif' }}
                    >
                      <span className="hidden md:inline">View Details</span>
                      <span className="md:hidden">View</span>
                      <FiDownload className="w-4 h-4" />
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

export default DoctorReportsPage;
