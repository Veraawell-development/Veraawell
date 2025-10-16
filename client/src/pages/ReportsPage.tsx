import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const reportsData = [
  { date: '3rd September 2025', psychologist: 'Dr. Riya Singh', downloadLink: '#' },
  { date: '3rd September 2025', psychologist: 'Dr. Riya Singh', downloadLink: '#' },
  ...Array(8).fill({ date: '', psychologist: '', downloadLink: '' }),
];

const ReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    console.log('Logout clicked');
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-gray-50 font-bree-serif">
      {/* Sidebar */}
      {sidebarOpen && <div className="fixed inset-0 z-40" onClick={() => setSidebarOpen(false)} />}
      <div className={`fixed left-0 top-0 h-full w-64 shadow-lg transform transition-transform duration-300 ease-in-out z-50 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ backgroundColor: '#7DA9A8' }}>
        <div className="h-full flex flex-col p-4 text-white">
          <div className="space-y-3 mb-6">
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2" onClick={() => navigate('/patient-dashboard')}><span className="text-base font-medium">My Dashboard</span></div>
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2"><span className="text-base font-medium">My Calls</span></div>
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
              {reportsData.map((report, index) => (
                <tr key={index} className="border-b border-gray-200 h-20">
                  <td className="p-4 text-gray-700 text-lg border-r-2 border-gray-300">{report.date}</td>
                  <td className="p-4 text-gray-700 text-lg border-r-2 border-gray-300">{report.psychologist}</td>
                  <td className="p-4">
                    {report.downloadLink && (
                      <a href={report.downloadLink} className="text-blue-600 hover:underline text-lg flex items-center">
                        Download File
                        <svg className="w-6 h-6 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V3"></path></svg>
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
