import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiMenu, FiDownload } from 'react-icons/fi';

interface Report {
  _id: string;
  date: string;
  reportUrl?: string;
}

const DoctorReportsDetailPage: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [patientName] = useState('Arun Sharma');
  const navigate = useNavigate();
  const { patientId } = useParams();

  useEffect(() => {
    fetchPatientReports();
  }, [patientId]);

  const fetchPatientReports = async () => {
    try {
      setLoading(true);
      // Mock data
      const mockReports: Report[] = [
        { _id: '1', date: '25th September 2025' },
        { _id: '2', date: '20th September 2025' },
        { _id: '3', date: '19th August 2025' },
        { _id: '4', date: '25th September 2025' },
        { _id: '5', date: '25th September 2025' },
        { _id: '6', date: '25th September 2025' },
        { _id: '7', date: '25th September 2025' }
      ];
      setReports(mockReports);
    } catch (error) {
      console.error('Error fetching patient reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewReport = (reportId: string) => {
    console.log('View report:', reportId);
    // TODO: Implement PDF viewer or download
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

      <div className="px-6 py-8 max-w-6xl mx-auto">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
          <div className="px-8 py-5 font-bold text-2xl text-center" style={{ backgroundColor: '#E8E5F0', fontFamily: 'Bree Serif, serif', color: '#000000' }}>
            {patientName}
          </div>

          <div>
            {reports.map((report, index) => (
              <div 
                key={report._id} 
                className="grid grid-cols-2 gap-8 px-12 py-6 items-center transition-colors hover:bg-gray-50"
                style={{ 
                  backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#F8F8F8',
                  borderBottom: index < reports.length - 1 ? '1px solid #E0E0E0' : 'none'
                }}
              >
                <div className="text-left font-semibold text-lg" style={{ fontFamily: 'Bree Serif, serif', color: '#000000' }}>
                  {report.date}
                </div>
                <div className="flex items-center justify-end gap-3">
                  <button 
                    onClick={() => handleViewReport(report._id)} 
                    className="text-base font-bold underline hover:opacity-70 transition-opacity flex items-center gap-2"
                    style={{ fontFamily: 'Bree Serif, serif', color: '#000000' }}
                  >
                    View Report
                    <FiDownload className="w-5 h-5" style={{ color: '#EF4444' }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 text-center">
          <button 
            onClick={() => navigate('/doctor-reports')} 
            className="px-12 py-3 rounded-full font-bold text-lg shadow-md hover:shadow-lg transition-all"
            style={{ 
              backgroundColor: '#FFFFFF',
              color: '#000000',
              fontFamily: 'Bree Serif, serif',
              border: '2px solid #E0E0E0'
            }}
          >
            Back to Reports
          </button>
        </div>
      </div>
    </div>
  );
};

export default DoctorReportsDetailPage;
