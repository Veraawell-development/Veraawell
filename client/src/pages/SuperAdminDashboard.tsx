import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiMenu, FiLogOut, FiUsers, FiFileText, FiActivity, FiChevronLeft, FiChevronRight,
  FiInbox, FiCreditCard, FiDollarSign, FiTrendingUp, FiMessageSquare, FiKey, FiX,
} from 'react-icons/fi';
import { LuStethoscope } from 'react-icons/lu';
import { Plus } from 'lucide-react';
import { useAdmin } from '../context/AdminContext';
import { readRememberedTab, rememberTab, resolveAdminTab, tabsForRole, isTabAllowed, type AdminTab } from '../utils/adminTabs';
import { newEnquiryCountQuery, statisticsQuery } from '../components/admin/queries';
import ChangePasswordModal from '../components/admin/ChangePasswordModal';
import AnalyticsTab from '../components/admin/AnalyticsTab';
import DoctorsTab from '../components/admin/DoctorsTab';
import AdminsTab from '../components/admin/AdminsTab';
import ReviewsTab from '../components/admin/ReviewsTab';
import BankDetailsTab from '../components/admin/BankDetailsTab';
import WeeklyPayoutsTab from '../components/admin/WeeklyPayoutsTab';
import RevenueTab from '../components/admin/RevenueTab';
import EnquiriesTab from '../components/admin/EnquiriesTab';
import ArticlesTab from '../components/admin/ArticlesTab';

const TAB_META: Record<AdminTab, { label: string; title: string; icon: React.ReactNode }> = {
  analytics: { label: 'Analytics', title: 'Dashboard Overview', icon: <FiActivity size={16} /> },
  doctors: { label: 'Pending Doctors', title: 'Doctor Approvals', icon: <LuStethoscope size={16} /> },
  admins: { label: 'Pending Admins', title: 'Admin Approvals', icon: <FiUsers size={16} /> },
  reviews: { label: 'Reviews', title: 'Review Moderation', icon: <FiMessageSquare size={16} /> },
  bankDetails: { label: 'Bank Details', title: 'Bank Details', icon: <FiCreditCard size={16} /> },
  weeklyPayouts: { label: 'Weekly Payouts', title: 'Weekly Payouts', icon: <FiDollarSign size={16} /> },
  revenue: { label: 'Revenue', title: 'Platform Revenue', icon: <FiTrendingUp size={16} /> },
  enquiries: { label: 'Enquiries', title: 'Enquiries', icon: <FiInbox size={16} /> },
  articles: { label: 'Articles', title: 'Manage Articles', icon: <FiFileText size={16} /> },
};

/**
 * The admin console shell: sidebar, header, and whichever tab is open.
 *
 * Each tab owns its queries and mounts only while open, so the console no
 * longer loads every queue (and every super-admin endpoint) up front. The
 * sidebar badges come from the statistics endpoint, plus one count for new
 * enquiries.
 */
const SuperAdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { admin, logout } = useAdmin();
  const role = admin?.role;
  const isSuperAdmin = role === 'super_admin';

  const [sidebarOpen, setSidebarOpen] = useState(false); // Mobile drawer
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // Desktop collapse
  const [changingPassword, setChangingPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>(() =>
    resolveAdminTab(role, (location.state as { tab?: unknown } | null)?.tab, readRememberedTab())
  );

  // A link into a tab (the article editor's "back", /admin/articles) —
  // honoured only if this admin may open it.
  useEffect(() => {
    const requested = (location.state as { tab?: unknown } | null)?.tab;
    if (isTabAllowed(requested, role)) setActiveTab(requested);
  }, [location.state, role]);

  // The role can change under an open console (a re-check after demotion).
  useEffect(() => {
    if (!isTabAllowed(activeTab, role)) setActiveTab(resolveAdminTab(role));
  }, [activeTab, role]);

  useEffect(() => {
    rememberTab(activeTab);
  }, [activeTab]);

  const stats = useQuery({ ...statisticsQuery, enabled: !!admin });
  const newEnquiries = useQuery({ ...newEnquiryCountQuery, enabled: isSuperAdmin });

  const badges: Partial<Record<AdminTab, number>> = {
    doctors: stats.data?.doctors?.pending ?? 0,
    admins: isSuperAdmin ? stats.data?.admins?.pending ?? 0 : 0,
    enquiries: newEnquiries.data ?? 0,
  };

  const selectTab = (tab: AdminTab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/admin-login', { replace: true });
  };

  const tabs = tabsForRole(role);

  return (
    <div className="min-h-screen flex bg-[#fcfbfa] text-neutral-800 antialiased font-sans">

      {/* Mobile: the drawer covers the page; tapping outside closes it. */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <div
        className={`fixed inset-y-0 left-0 z-50 bg-[#001e24] text-[#fff3db] transform transition-all duration-300 ease-in-out md:translate-x-0
          ${sidebarCollapsed ? 'md:w-16' : 'md:w-60'} w-60
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex flex-col h-full p-4 overflow-y-auto">
          <div className={`mb-8 pt-2 flex items-center ${sidebarCollapsed ? 'md:justify-center' : ''} justify-between`}>
            <div className={sidebarCollapsed ? 'md:hidden' : ''}>
              <h1 className="text-sm font-semibold tracking-wider uppercase text-[#0097b2]">Veraawell</h1>
              <p className="text-[10px] text-[#fff3db] opacity-60 mt-0.5">Control Panel</p>
            </div>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden md:flex items-center justify-center w-6 h-6 rounded-full bg-[#fff3db]/5 hover:bg-[#fff3db]/10 text-[#fff3db]/70 transition-colors"
            >
              {sidebarCollapsed ? <FiChevronRight size={12} /> : <FiChevronLeft size={12} />}
            </button>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
              className="md:hidden flex items-center justify-center w-7 h-7 rounded-full bg-[#fff3db]/5 text-[#fff3db]/70"
            >
              <FiX size={14} />
            </button>
          </div>

          <nav className="flex-1 space-y-1">
            {tabs.map((tab) => {
              const meta = TAB_META[tab];
              const active = activeTab === tab;
              const badge = badges[tab] ?? 0;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => selectTab(tab)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${active ? 'bg-[#0097b2] text-white' : 'text-[#fff3db]/70 hover:bg-[#fff3db]/5 hover:text-[#fff3db]'} ${sidebarCollapsed ? 'md:justify-center' : ''}`}
                  title={sidebarCollapsed ? meta.label : ''}
                >
                  {sidebarCollapsed ? (
                    <>
                      <div className={`hidden md:block w-2 h-2 rounded-full ${active ? 'bg-white' : 'bg-[#fff3db]/40'}`} />
                      <span className="md:hidden">{meta.icon}</span>
                    </>
                  ) : meta.icon}
                  <span className={sidebarCollapsed ? 'md:hidden' : ''}>{meta.label}</span>
                  {badge > 0 && (
                    sidebarCollapsed
                      ? <div className="absolute top-1 right-1 w-2 h-2 bg-[#fff3db] rounded-full" />
                      : (
                        <span className="ml-auto bg-[#fff3db] text-[#001e24] text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                          {badge}
                        </span>
                      )
                  )}
                </button>
              );
            })}
          </nav>

          {/* Account */}
          <div className="border-t border-[#fff3db]/10 pt-4 mt-4">
            <div className={`flex items-center gap-3 px-2 mb-3 ${sidebarCollapsed ? 'md:hidden' : ''}`}>
              <div className="w-8 h-8 rounded-full bg-[#0097b2] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {admin?.firstName?.[0] || 'A'}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-medium truncate">{admin?.firstName} {admin?.lastName}</p>
                <p className="text-[10px] text-[#fff3db]/50 truncate">{isSuperAdmin ? 'Super Admin' : 'Admin'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setChangingPassword(true); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-[#fff3db]/70 hover:bg-[#fff3db]/5 hover:text-[#fff3db] transition-colors ${sidebarCollapsed ? 'md:justify-center' : ''}`}
              title={sidebarCollapsed ? 'Change password' : ''}
            >
              <FiKey size={16} />
              <span className={sidebarCollapsed ? 'md:hidden' : ''}>Change password</span>
            </button>
            <button
              type="button"
              onClick={() => { void handleLogout(); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors ${sidebarCollapsed ? 'md:justify-center' : ''}`}
              title={sidebarCollapsed ? 'Logout' : ''}
            >
              <FiLogOut size={16} />
              <span className={sidebarCollapsed ? 'md:hidden' : ''}>Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Content ────────────────────────────────────────────────── */}
      <div className={`flex-1 min-w-0 flex flex-col transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'md:pl-16' : 'md:pl-60'}`}>
        <header className="h-14 bg-white border-b border-neutral-100 flex items-center justify-between px-4 md:px-6 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              className="md:hidden text-neutral-600"
            >
              <FiMenu size={18} />
            </button>
            <h1 className="text-base font-semibold text-neutral-800 truncate">{TAB_META[activeTab].title}</h1>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            {activeTab === 'articles' ? (
              <button
                type="button"
                onClick={() => navigate('/super-admin-dashboard/articles/new')}
                className="px-4 py-2 bg-[#0097b2] hover:bg-[#007c93] text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5"
              >
                <Plus size={14} />
                New Article
              </button>
            ) : (
              <div className="hidden sm:block text-xs text-neutral-500 font-medium">
                Welcome back, {admin?.firstName}
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === 'analytics' && <AnalyticsTab />}
              {activeTab === 'doctors' && <DoctorsTab isSuperAdmin={isSuperAdmin} />}
              {activeTab === 'reviews' && <ReviewsTab />}
              {isSuperAdmin && activeTab === 'admins' && <AdminsTab currentAdminId={admin?.id ?? ''} />}
              {isSuperAdmin && activeTab === 'bankDetails' && <BankDetailsTab />}
              {isSuperAdmin && activeTab === 'weeklyPayouts' && <WeeklyPayoutsTab />}
              {isSuperAdmin && activeTab === 'revenue' && <RevenueTab />}
              {isSuperAdmin && activeTab === 'enquiries' && <EnquiriesTab />}
              {isSuperAdmin && activeTab === 'articles' && <ArticlesTab />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <ChangePasswordModal open={changingPassword} onClose={() => setChangingPassword(false)} />
    </div>
  );
};

export default SuperAdminDashboard;
