import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface DoctorSidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

/**
 * The therapist's menu. It listed five pages and missed Reports, Messages,
 * the calendar and Pricing & Payouts, so those were only reachable from
 * buttons scattered over the dashboard; and every entry was a clickable div,
 * out of reach of the keyboard.
 */
const SECTIONS: { title: string; items: { label: string; to: string; icon: string }[] }[] = [
  {
    title: 'Main',
    items: [
      { label: 'Dashboard', to: '/doctor-dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { label: 'Calendar', to: '/manage-calendar', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
      { label: 'Messages', to: '/messages', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
      { label: 'My Calls', to: '/call-history', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
    ],
  },
  {
    title: 'Clinical',
    items: [
      { label: 'My Patients', to: '/patient-details', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
      { label: 'Session Notes', to: '/doctor-session-notes', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
      { label: 'Reports', to: '/doctor-reports', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
      { label: 'Tasks Assigned', to: '/doctor-tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'My Profile', to: '/profile-setup', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
      { label: 'Pricing & Payouts', to: '/doctor-settings', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    ],
  },
];

const DoctorSidebar: React.FC<DoctorSidebarProps> = ({ sidebarOpen, setSidebarOpen }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { logout, user } = useAuth();

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen, setSidebarOpen]);

  const go = (to: string) => { navigate(to); setSidebarOpen(false); };

  return (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/5 z-40" onClick={() => setSidebarOpen(false)} />
      )}

      <nav
        aria-label="Practice menu"
        aria-hidden={!sidebarOpen}
        inert={!sidebarOpen}
        className={`fixed left-0 top-0 h-screen w-[260px] shadow-[4px_0_24px_rgba(0,0,0,0.02)] transform transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] z-50 bg-white border-r border-gray-100 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="h-full flex flex-col p-5 pt-8 font-sans">
          <div className="flex justify-between items-center mb-6">
            <h2 className="px-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Menu</h2>
            <button onClick={() => setSidebarOpen(false)} aria-label="Close menu" className="p-1.5 hover:bg-gray-100 rounded-md transition-colors">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {SECTIONS.map((section) => (
              <div key={section.title} className="mb-5">
                <h3 className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">{section.title}</h3>
                <ul className="space-y-1">
                  {section.items.map((item) => {
                    const active = pathname === item.to || (item.to !== '/doctor-dashboard' && pathname.startsWith(`${item.to}/`));
                    return (
                      <li key={item.to}>
                        <button
                          type="button"
                          onClick={() => go(item.to)}
                          aria-current={active ? 'page' : undefined}
                          className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl transition-colors text-left ${active ? 'bg-teal-50 text-teal-800' : 'text-gray-600 hover:bg-gray-50'}`}
                        >
                          <svg className={`w-5 h-5 ${active ? 'text-teal-700' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                          </svg>
                          <span className="text-[13.5px] font-semibold">{item.label}</span>
                        </button>
                      </li>
                    );
                  })}
                  {section.title === 'Account' && user?.userId && (
                    <li>
                      {/* What patients see: the public profile page. */}
                      <button
                        type="button"
                        onClick={() => go(`/doctor/${user.userId}`)}
                        className="w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl transition-colors text-left text-gray-600 hover:bg-gray-50"
                      >
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        <span className="text-[13.5px] font-semibold">View my public profile</span>
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            ))}

            <div className="pt-4 mt-2 border-t border-gray-100">
              <button
                type="button"
                className="w-full flex items-center space-x-3 text-gray-500 hover:text-red-600 hover:bg-red-50 px-4 py-2.5 rounded-xl transition-colors text-left"
                onClick={async () => {
                  try {
                    await logout();
                    navigate('/');
                  } catch {
                    window.location.href = '/';
                  }
                }}
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="text-[13.5px] font-semibold">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
};

export default DoctorSidebar;
