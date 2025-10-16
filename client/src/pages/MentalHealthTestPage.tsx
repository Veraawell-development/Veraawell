import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const MentalHealthTestPage: React.FC = () => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    console.log('Logout clicked');
    window.location.href = '/';
  };

  const answerOptions = ['Never', 'Hardly ever', 'Sometimes', 'Many times', 'All the time'];

  return (
    <div className="min-h-screen bg-gray-100 font-bree-serif">
      {/* Sidebar */}
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setSidebarOpen(false)} />}
      <div className={`fixed left-0 top-0 h-full w-64 shadow-lg transform transition-transform duration-300 ease-in-out z-50 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ backgroundColor: '#7DA9A8' }}>
        <div className="h-full flex flex-col p-4 text-white">
          <div className="space-y-3 mb-6">
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-md" onClick={() => navigate('/patient-dashboard')}><span className="text-lg">My Dashboard</span></div>
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-md"><span className="text-lg">My Calls</span></div>
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-md"><span className="text-lg">My Payments</span></div>
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-md"><span className="text-lg">My Profile</span></div>
          </div>
          <div className="mt-auto space-y-3">
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-md"><span className="text-lg">Settings</span></div>
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-md" onClick={handleLogout}><span className="text-lg">Sign Out</span></div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={`transition-all duration-300 ease-in-out ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
        {/* Header */}
        <div className="bg-[#C3B9E2] text-white py-3 px-5 flex items-center shadow-md">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="mr-5 p-2 rounded-full hover:bg-white/20 transition-colors">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
          </button>
          <h1 className="text-3xl font-bold">Mental Health Screening</h1>
        </div>

        {/* Test Content */}
        <div className="p-6 sm:p-10">
          <div className="bg-white p-8 rounded-2xl shadow-lg max-w-4xl mx-auto">
            <div className="flex justify-between items-start mb-10">
              <h2 className="text-4xl font-bold text-gray-800">Do I have ADHD?</h2>
              <img src="/assest02.svg" alt="Illustration" className="h-28 w-28" />
            </div>

            <p className="text-gray-700 text-2xl font-semibold mb-6">Question: <span className="text-blue-600 underline">1/20</span></p>
            
            <p className="text-4xl text-gray-800 font-bold mb-12">I feel sad and low</p>

            <div className="flex flex-wrap justify-center sm:justify-between items-center gap-4">
              {answerOptions.map((option, index) => (
                <button key={index} className="bg-white border-2 border-gray-400 text-gray-800 font-semibold py-3 px-8 rounded-xl text-xl hover:bg-gray-200 hover:border-gray-500 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent">
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MentalHealthTestPage;
