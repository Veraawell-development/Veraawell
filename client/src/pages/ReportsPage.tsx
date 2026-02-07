import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import { generateReportPDF } from '../utils/pdfGenerator';
import logger from '../utils/logger';
import type { Report } from '../types';

const ReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      setLoading(true);
      if (!user) return;

      const response = await fetch(
        `${API_CONFIG.BASE_URL}/session-tools/reports/patient/${user.userId}`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setReports(data);
    } catch (error) {
      logger.error('Error fetching reports:', error);
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = (report: Report) => {
    generateReportPDF(report);
  };

  const handleLogout = () => {
    console.log('Logout clicked');
    window.location.href = '/';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-serif">Loading reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-bree-serif">
      {/* Sidebar */}
      {sidebarOpen && <div className="fixed inset-0 z-40" onClick={() => setSidebarOpen(false)} />}
      <div className={`fixed left-0 top-0 h-full w-64 shadow-lg transform transition-transform duration-300 ease-in-out z-50 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ backgroundColor: '#7DA9A8' }}>
        <div className="h-full flex flex-col p-4 text-white">
          <div className="space-y-3 mb-6">
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2" onClick={() => navigate('/patient-dashboard')}><span className="text-base font-medium">My Dashboard</span></div>
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2" onClick={() => navigate('/call-history')}><span className="text-base font-medium">My Calls</span></div>
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2"><span className="text-base font-medium">My Payments</span></div>
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2"><span className="text-base font-medium">My Profile</span></div>
          </div>
          <div className="mt-auto space-y-3">
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2"><span className="text-base font-medium">Settings</span></div>
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2" onClick={handleLogout}><span className="text-base font-medium">Sign Out</span></div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={`transition-all duration-300 ease-in-out ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
        {/* Header */}
        <div className="bg-[#38ABAE] text-white py-4 px-6 flex items-center shadow-md">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="mr-6 p-2 rounded-full hover:bg-white/20 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
          </button>
          <h1 className="text-3xl font-bold">Reports & Recommendation</h1>
        </div>

        {/* Table */}
        <div className="bg-white shadow-lg">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="p-4 text-left text-xl font-bold text-gray-800 border-r-2 border-gray-300">DATE</th>
                <th className="p-4 text-left text-xl font-bold text-gray-800 border-r-2 border-gray-300">PSYCHOLOGIST</th>
                <th className="p-4 text-left text-xl font-bold text-gray-800">DOWNLOADS</th>
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-16 text-center">
                    <p className="text-xl text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>No reports available</p>
                    <p className="text-gray-400 mt-2" style={{ fontFamily: 'Inter, sans-serif' }}>Your reports will appear here</p>
                  </td>
                </tr>
              ) : (
                <>
                  {reports.map((report) => (
                    <tr key={report._id} className="border-b border-gray-200 h-20">
                      <td className="p-4 text-gray-700 text-lg border-r-2 border-gray-300">
                        {new Date(report.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </td>
                      <td className="p-4 text-gray-700 text-lg border-r-2 border-gray-300">
                        Dr. {report.doctorId.firstName} {report.doctorId.lastName}
                      </td>
                      <td className="p-4">
                        <button
                          onClick={() => handleDownload(report)}
                          className="text-blue-600 hover:underline text-lg flex items-center"
                        >
                          Download PDF
                          <svg className="w-6 h-6 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V3"></path></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {/* Empty rows to maintain table height */}
                  {Array.from({ length: Math.max(0, 8 - reports.length) }).map((_, index) => (
                    <tr key={`empty-${index}`} className="border-b border-gray-200 h-20">
                      <td className="p-4 border-r-2 border-gray-300">&nbsp;</td>
                      <td className="p-4 border-r-2 border-gray-300">&nbsp;</td>
                      <td className="p-4">&nbsp;</td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
