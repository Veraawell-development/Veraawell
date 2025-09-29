import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const DoctorDashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isActive, setIsActive] = useState(true);
  
  // Get user name from location state or default
  let userName = "Harris";
  if (location.state && (location.state as any).username) {
    const fullUsername = (location.state as any).username;
    // Extract username from email (everything before @)
    if (fullUsername.includes('@')) {
      userName = fullUsername.split('@')[0];
    } else {
      userName = fullUsername;
    }
  }

  const handleLogout = async () => {
    try {
      const API_BASE_URL = window.location.hostname === 'localhost' 
        ? 'http://localhost:5001/api' 
        : 'https://veraawell-backend.onrender.com/api';
        
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar Overlay - Transparent */}
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
          {/* Main Menu Items */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span className="text-base font-medium">My Dashboard</span>
            </div>
            
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <span className="text-base font-medium">My Calls</span>
            </div>
            
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
              <span className="text-base font-medium">My Patients</span>
            </div>
            
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-base font-medium">My Profile</span>
            </div>
          </div>

          {/* Bottom Menu Items */}
          <div className="mt-auto space-y-3">
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-base font-medium">Settings</span>
            </div>
            
            <div 
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2"
              onClick={handleLogout}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="text-base font-medium">Sign Out</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Navigation Bar */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Left side - Hamburger Menu */}
            <div className="flex items-center">
              <button 
                onClick={() => {
                  console.log('Hamburger clicked, current state:', sidebarOpen);
                  setSidebarOpen(true);
                }}
                className="p-2 hover:bg-gray-100 rounded-md transition-colors z-10 relative"
                type="button"
              >
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>

            {/* Center - Greeting */}
            <div className="flex-1 text-center">
              <h1 className="text-2xl font-bold text-gray-800 font-serif">
                Hi {userName}
              </h1>
            </div>

            {/* Right side - Notification and Active Toggle */}
            <div className="flex items-center space-x-4">
              {/* Notification Icon with Chat Bubble Style */}
              <div className="relative">
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                  <span className="text-xs text-white font-bold">3</span>
                </div>
              </div>
              
              {/* Active/OFF Toggle Switch */}
              <div className="flex items-center">
                <div className="relative">
                  <button
                    onClick={() => setIsActive(!isActive)}
                    className={`relative inline-flex items-center h-8 rounded-full w-16 transition-colors duration-200 ease-in-out ${
                      isActive ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block w-6 h-6 transform bg-white rounded-full transition-transform duration-200 ease-in-out ${
                        isActive ? 'translate-x-9' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className={`absolute left-2 top-1 text-xs font-medium font-serif ${
                    isActive ? 'text-white' : 'text-gray-600'
                  }`}>
                    {isActive ? 'Active' : 'OFF'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Dashboard Content */}
      <div className="px-4 py-4">
        {/* 2x2 Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ height: '75vh' }}>
          
          {/* Session Notes Card */}
          <div className="p-6 text-white flex flex-col" style={{ backgroundColor: '#38ABAE' }}>
            <h3 className="text-xl font-bold font-serif mb-4">Session Notes</h3>
            <div className="space-y-3 flex-1">
              <div className="border-b border-white/20 pb-2">
                <p className="font-serif text-base">3rd September, 2025 - Neha Singh</p>
              </div>
              <div className="border-b border-white/20 pb-2">
                <p className="font-serif text-base">27th August, 2025 - Neha Singh</p>
              </div>
            </div>
            <button className="mt-4 bg-white text-teal-600 px-6 py-2 font-serif text-base font-medium hover:bg-gray-100 transition-colors self-start" style={{ borderRadius: '20px' }}>
              View All
            </button>
          </div>

          {/* Key Metrics Card */}
          <div className="p-6 text-white flex flex-col" style={{ backgroundColor: '#ABA5D1' }}>
            <h3 className="text-xl font-bold font-serif mb-4">Key Metrics</h3>
            <div className="grid grid-cols-2 gap-3 flex-1">
              <div className="bg-white p-4 text-center flex flex-col justify-center">
                <p className="text-gray-600 font-serif text-sm mb-1">Total Revenue</p>
                <p className="text-xl font-bold text-gray-800">5,00,000</p>
              </div>
              <div className="bg-white p-4 text-center flex flex-col justify-center">
                <p className="text-gray-600 font-serif text-sm mb-1">Total Sessions</p>
                <p className="text-xl font-bold text-gray-800">170</p>
              </div>
              <div className="bg-white p-4 text-center flex flex-col justify-center">
                <p className="text-gray-600 font-serif text-sm mb-1">Total Hrs Of Therapy</p>
                <p className="text-xl font-bold text-gray-800">150</p>
              </div>
              <div className="bg-white p-4 text-center flex flex-col justify-center">
                <p className="text-gray-600 font-serif text-sm mb-1">DLA- 20</p>
                <p className="text-gray-600 font-serif text-base">Messa...</p>
              </div>
            </div>
          </div>

          {/* Calendar Card */}
          <div className="p-6 text-white flex flex-col" style={{ backgroundColor: '#ABA5D1' }}>
            <h3 className="text-xl font-bold font-serif mb-3">Calendar</h3>
            <div className="text-center mb-4">
              <h4 className="text-2xl font-bold font-serif">August</h4>
              <p className="text-lg font-serif">2025</p>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-serif mb-3">
              <div className="font-semibold">Sun</div>
              <div className="font-semibold">Mon</div>
              <div className="font-semibold">Tue</div>
              <div className="font-semibold">Wed</div>
              <div className="font-semibold">Thu</div>
              <div className="font-semibold">Fri</div>
              <div className="font-semibold">Sat</div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-serif flex-1">
              {/* Calendar days */}
              <div></div><div></div><div></div><div></div><div className="p-1">1</div><div className="p-1">2</div><div className="p-1">3</div>
              <div className="p-1">6</div><div className="p-1">7</div><div className="p-1">8</div><div className="p-1">9</div><div className="p-1">10</div><div className="p-1">11</div><div className="p-1">12</div>
              <div className="p-1">13</div><div className="p-1">14</div><div className="p-1">15</div><div className="p-1">16</div><div className="p-1">17</div><div className="bg-red-500 p-1">18</div><div className="p-1">19</div>
              <div className="p-1">20</div><div className="p-1">21</div><div className="p-1">22</div><div className="p-1">23</div><div className="p-1">24</div><div className="p-1">25</div><div className="p-1">26</div>
              <div className="p-1">27</div><div className="p-1">28</div><div className="p-1">29</div><div className="p-1">30</div><div className="p-1">31</div><div></div><div></div>
            </div>
            <div className="flex justify-between items-center mt-3 text-xs font-serif">
              <div className="flex items-center">
                <div className="w-2 h-2 bg-red-500 mr-1"></div>
                <span>Upcoming sessions</span>
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-green-500 mr-1"></div>
                <span>Attended sessions</span>
              </div>
            </div>
            <button className="mt-3 bg-white text-purple-600 px-4 py-1.5 font-serif text-sm font-medium hover:bg-gray-100 transition-colors self-start" style={{ borderRadius: '20px' }}>
              View Details
            </button>
          </div>

          {/* Tasks Assigned + Reports Card */}
          <div className="flex flex-col space-y-3">
            {/* Tasks Assigned Section */}
            <div className="p-4 text-white flex-1 flex flex-col" style={{ backgroundColor: '#6DBEDF' }}>
              <h3 className="text-lg font-bold font-serif mb-3">Tasks Assigned</h3>
              <div className="bg-white/20 p-3 flex-1">
                <div className="grid grid-cols-3 gap-2 text-sm font-serif mb-2 font-semibold">
                  <span>Name</span>
                  <span>Last Date</span>
                  <span>Tasks</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm font-serif mb-2">
                  <span>Riya Gupta</span>
                  <span>3rd September, 2025</span>
                  <span>Exercise Everyday, do painting</span>
                </div>
              </div>
              <button className="mt-3 bg-white text-blue-600 px-4 py-1.5 font-serif text-sm font-medium hover:bg-gray-100 transition-colors self-start" style={{ borderRadius: '20px' }}>
                View All
              </button>
            </div>

            {/* Reports Section */}
            <div className="p-4 text-white flex-1 flex flex-col" style={{ backgroundColor: '#78BE9F' }}>
              <h3 className="text-lg font-bold font-serif mb-3">Reports</h3>
              <div className="bg-white/20 p-3 flex-1">
                <div className="grid grid-cols-3 gap-2 text-sm font-serif mb-2 font-semibold">
                  <span>Name</span>
                  <span>Last Date</span>
                  <span>Reports</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm font-serif">
                  <span>Amit Singh</span>
                  <span>25th June 2026</span>
                  <div className="flex items-center">
                    <svg className="w-4 h-4 text-red-500 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </div>
              <button className="mt-3 bg-white text-green-600 px-4 py-1.5 font-serif text-sm font-medium hover:bg-gray-100 transition-colors self-start" style={{ borderRadius: '20px' }}>
                View All
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default DoctorDashboard;
