import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface DoctorSidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const DoctorSidebar: React.FC<DoctorSidebarProps> = ({ sidebarOpen, setSidebarOpen }) => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <>
      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/5 z-40 transition-opacity duration-300 ease-in-out"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed left-0 top-0 h-screen w-[260px] shadow-[4px_0_24px_rgba(0,0,0,0.02)] transform transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] z-50 bg-white border-r border-gray-100 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
        <div className="h-full flex flex-col p-5 pt-8 font-sans">
          {/* Sidebar Header / Mobile Close */}
          <div className="flex justify-between items-center mb-6 md:hidden">
            <h3 className="px-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Menu</h3>
            <button onClick={() => setSidebarOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-md transition-colors">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Main Menu Items */}
          <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            
            {/* MAIN SECTION */}
            <div className="mb-6">
              <h3 className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Main</h3>
              <div className="space-y-1">
                {/* Active Item - Dashboard */}
                <div 
                  className="flex items-center space-x-3 cursor-pointer bg-gray-100/70 px-4 py-2.5 rounded-xl transition-colors group"
                  onClick={() => { navigate('/doctor-dashboard'); setSidebarOpen(false); }}
                >
                  <svg className="w-5 h-5 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                  <span className="text-[13.5px] font-semibold text-gray-900">Dashboard</span>
                </div>

                <div
                  className="flex items-center space-x-3 cursor-pointer text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors group"
                  onClick={() => { navigate('/doctor-tasks'); setSidebarOpen(false); }}
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">Tasks Assigned</span>
                </div>
              </div>
            </div>

            {/* CLINICAL SECTION */}
            <div className="mb-6">
              <h3 className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Clinical</h3>
              <div className="space-y-1">
                <div
                  className="flex items-center space-x-3 cursor-pointer text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors group"
                  onClick={() => { navigate('/patient-details'); setSidebarOpen(false); }}
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">My Patients</span>
                </div>

                <div
                  className="flex items-center space-x-3 cursor-pointer text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors group"
                  onClick={() => { navigate('/doctor-session-notes'); setSidebarOpen(false); }}
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">Session Notes</span>
                </div>

                <div
                  className="flex items-center space-x-3 cursor-pointer text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors group"
                  onClick={() => { navigate('/call-history'); setSidebarOpen(false); }}
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">My Calls</span>
                </div>
              </div>
            </div>

            {/* ACCOUNT SECTION */}
            <div className="mb-6">
              <h3 className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Account</h3>
              <div className="space-y-1">
                <div
                  className="flex items-center space-x-3 cursor-pointer text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors group"
                  onClick={() => { navigate('/profile-setup'); setSidebarOpen(false); }}
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">My Profile</span>
                </div>

                <div
                  className="flex items-center space-x-3 cursor-pointer text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors group"
                  onClick={() => { navigate('/doctor-earning'); setSidebarOpen(false); }}
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">Earnings</span>
                </div>
              </div>
            </div>

            {/* LOGOUT */}
            <div className="pt-4 mt-6 border-t border-gray-100">
              <div
                className="flex items-center space-x-3 cursor-pointer text-gray-500 hover:text-red-600 hover:bg-red-50 px-4 py-2.5 rounded-xl transition-colors group"
                onClick={async () => {
                  try {
                    await logout();
                    navigate('/');
                  } catch (error) {
                    window.location.href = '/';
                  }
                }}
              >
                <svg className="w-5 h-5 text-gray-400 group-hover:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="text-[13.5px] font-semibold">Sign Out</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
};

export default DoctorSidebar;
