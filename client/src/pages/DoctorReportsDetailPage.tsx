import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiMenu, FiDownload, FiArrowLeft, FiFile } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';

interface Report {
  _id: string;
  title: string;
  reportType: string;
  content: string;
  createdAt: string;
  patientId: {
    firstName: string;
    lastName: string;
  }
}

const DoctorReportsDetailPage: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
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
    fetchPatientReports();
  }, [patientId, user]);

  const fetchPatientReports = async () => {
    if (!patientId || !user) return;

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API_BASE_URL}/session-tools/reports/patient/${patientId}`, {
        credentials: 'include',
        headers
      });

      if (!response.ok) throw new Error('Failed to fetch patient reports');
      const data = await response.json();

      setReports(data);
      if (data.length > 0 && data[0].patientId) {
        setPatientName(`${data[0].patientId.firstName} ${data[0].patientId.lastName}`);
      }
    } catch (error) {
      console.error('Error fetching patient reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
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
            {patientName ? `${patientName}'s Reports` : 'Patient Reports'}
          </h1>
        </div>
      </div>

      <div className="px-4 py-8 max-w-5xl mx-auto">
        <div className="flex items-center mb-6">
          <button
            onClick={() => navigate('/doctor-reports')}
            className="flex items-center text-teal-600 hover:text-teal-800 font-medium transition-colors"
          >
            <FiArrowLeft className="mr-2" /> Back to All Patients
          </button>
        </div>

        {reports.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-gray-100">
            <div className="bg-teal-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <FiDownload className="w-8 h-8 text-teal-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2 font-serif">No Reports Found</h3>
            <p className="text-gray-500">No reports generated for this patient yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => (
              <div key={report._id} className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all p-6 relative overflow-hidden group">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-teal-50 rounded-xl text-teal-600">
                      <FiFile className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 group-hover:text-teal-600 transition-colors" style={{ fontFamily: 'Bree Serif, serif' }}>
                        {report.title}
                      </h3>
                      <p className="text-sm text-gray-500">Generated on {formatDate(report.createdAt)}</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-bold uppercase rounded-full">
                    {report.reportType}
                  </span>
                </div>

                <div className="mt-4 pl-16">
                  <div className="bg-gray-50 rounded-lg p-4 text-gray-600 text-sm border border-gray-100">
                    <p className="whitespace-pre-wrap">{report.content}</p>
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

export default DoctorReportsDetailPage;
