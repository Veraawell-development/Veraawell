import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAdmin } from '../context/AdminContext';
import { FiMenu, FiLogOut, FiUsers, FiUserCheck, FiClock, FiFileText, FiActivity, FiX, FiCheck, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { LuStethoscope } from 'react-icons/lu';
import { Plus, Search, Filter, Eye, CheckCircle, Clock, Edit, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '../config/api';

interface PendingUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  role: string;
  createdAt: string;
  approvalStatus: string;
  // Doctor-specific fields
  specialization?: string;
  licenseNumber?: string;
  jobRole?: string;
  professionalMessage?: string;
  phoneNumber?: string;
  countryCode?: string;
  gender?: string;
  heardAboutUs?: string;
  dateOfBirth?: string;
  documents?: {
    fileName: string;
    fileUrl: string;
    fileType: string;
    cloudinaryPublicId: string;
    uploadedAt: string;
  }[];
}

interface Statistics {
  doctors: {
    pending: number;
    approved: number;
    rejected: number;
    total: number;
  };
  patients: {
    total: number;
  };
  admins?: {
    pending: number;
    approved: number;
    rejected: number;
    total: number;
  };
}

interface Analytics {
  sessions: {
    total: number;
    completed: number;
    cancelled: number;
    upcoming: number;
    last30Days: number;
    last7Days: number;
  };
  revenue: {
    total: number;
    last30Days: number;
    averagePerSession: string;
  };
  content: {
    reports: number;
    tasks: number;
    completedTasks: number;
  };
  growth: {
    newPatients30Days: number;
    newDoctors30Days: number;
  };
  topDoctors: Array<{ name: string; sessionCount: number }>;
}

interface Article {
  _id: string;
  title: string;
  category: string;
  status: 'draft' | 'published' | 'archived';
  featured: boolean;
  publishedDate?: string;
  views: number;
  likes: number;
  createdAt: string;
  author: string;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const SuperAdminDashboard: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false); // Mobile drawer
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // Desktop collapse
  const [doctorViewMode, setDoctorViewMode] = useState<'pending' | 'all'>('pending');
  const [adminViewMode, setAdminViewMode] = useState<'pending' | 'all'>('pending');
  const [payoutViewMode, setPayoutViewMode] = useState<'pending' | 'active'>('pending');
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'analytics' | 'doctors' | 'admins' | 'articles' | 'payouts' | 'revenue'>(() => {
    const locState = location.state as { tab?: string } | null;
    return (locState?.tab as any) || 'analytics';
  });
  const [viewingDocument, setViewingDocument] = useState<{ url: string, fileName: string, fileType: string } | null>(null);
  
  // Articles State
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [page, setPage] = useState(1);
  const [articleToDelete, setArticleToDelete] = useState<{ id: string, title: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [payoutModal, setPayoutModal] = useState<{ isOpen: boolean, type: 'approve' | 'reject', request: any } | null>(null);
  const [payoutRejectReason, setPayoutRejectReason] = useState('');

  const navigate = useNavigate();
  const { admin, logout, loading: adminLoading } = useAdmin();
  const queryClient = useQueryClient();

  const token = localStorage.getItem('adminToken');
  const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {};

  const fetchAndParse = async (url: string) => {
    const res = await fetch(url, { credentials: 'include', headers });
    if (!res.ok) throw new Error('Request failed');
    return res.json();
  };

  const { data: statistics, isLoading: statsLoading } = useQuery<Statistics>({
    queryKey: ['admin', 'statistics'],
    queryFn: () => fetchAndParse(`${API_BASE_URL}/admin/approvals/statistics`),
    enabled: !!admin && activeTab !== 'articles',
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<Analytics>({
    queryKey: ['admin', 'analytics'],
    queryFn: () => fetchAndParse(`${API_BASE_URL}/admin/approvals/analytics`),
    enabled: !!admin && activeTab !== 'articles',
  });

  const { data: pendingDoctors = [], isLoading: pendingDoctorsLoading } = useQuery<PendingUser[]>({
    queryKey: ['admin', 'doctors', 'pending'],
    queryFn: () => fetchAndParse(`${API_BASE_URL}/admin/approvals/doctors/pending`),
    enabled: !!admin && activeTab !== 'articles',
  });

  const { data: allDoctors = [], isLoading: allDoctorsLoading } = useQuery<PendingUser[]>({
    queryKey: ['admin', 'doctors', 'all'],
    queryFn: () => fetchAndParse(`${API_BASE_URL}/admin/approvals/doctors/all`),
    enabled: !!admin && activeTab !== 'articles',
  });

  const { data: pendingAdmins = [], isLoading: pendingAdminsLoading } = useQuery<PendingUser[]>({
    queryKey: ['admin', 'admins', 'pending'],
    queryFn: () => fetchAndParse(`${API_BASE_URL}/admin/approvals/admins/pending`),
    enabled: !!admin && admin.role === 'super_admin' && activeTab !== 'articles',
  });

  const { data: allAdmins = [], isLoading: allAdminsLoading } = useQuery<PendingUser[]>({
    queryKey: ['admin', 'admins', 'all'],
    queryFn: () => fetchAndParse(`${API_BASE_URL}/admin/approvals/admins/all`),
    enabled: !!admin && admin.role === 'super_admin' && activeTab !== 'articles',
  });

  const { data: payoutRequests = [], isLoading: payoutRequestsLoading } = useQuery<any[]>({
    queryKey: ['admin', 'payouts', payoutViewMode],
    queryFn: async () => {
      const res = await fetchAndParse(`${API_BASE_URL}/admin/payments/onboarding-requests?status=${payoutViewMode === 'pending' ? 'pending_admin_approval' : 'active'}`);
      return res.doctors || [];
    },
    enabled: !!admin && activeTab === 'payouts',
  });

  const { data: revenueData, isLoading: revenueLoading } = useQuery<any>({
    queryKey: ['admin', 'revenue'],
    queryFn: async () => fetchAndParse(`${API_BASE_URL}/admin/payments/revenue`),
    enabled: !!admin && activeTab === 'revenue',
  });

  const { data: articlesData, isLoading: articlesLoading } = useQuery({
    queryKey: ['admin', 'articles', page, debouncedSearch, selectedCategory, selectedStatus],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10',
        search: debouncedSearch,
        category: selectedCategory,
        status: selectedStatus
      });
      const response = await fetch(`${API_BASE_URL}/articles/admin/all?${params}`, {
        credentials: 'include',
        headers
      });
      if (!response.ok) throw new Error('Failed to load articles');
      return response.json();
    },
    enabled: !!admin && activeTab === 'articles',
  });

  const articles: Article[] = Array.isArray(articlesData) ? articlesData : (articlesData?.articles || []);
  const pagination: PaginationData | null = Array.isArray(articlesData) ? null : (articlesData?.pagination || null);

  const loading = activeTab !== 'articles' && activeTab !== 'payouts' && (
    statsLoading || analyticsLoading || pendingDoctorsLoading || allDoctorsLoading || 
    (admin?.role === 'super_admin' && (pendingAdminsLoading || allAdminsLoading))
  );

  useEffect(() => {
    const locState = location.state as { tab?: string } | null;
    if (locState?.tab && locState.tab !== activeTab) {
      setActiveTab(locState.tab as any);
    }
  }, [location.state]);

  useEffect(() => {
    if (adminLoading) return;

    if (!admin) {
      navigate('/admin-login');
      return;
    }
    if (!['admin', 'super_admin'].includes(admin.role)) {
      navigate('/admin-login');
      return;
    }
  }, [admin, adminLoading]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [selectedCategory, selectedStatus]);



  const deleteArticleMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`${API_BASE_URL}/articles/admin/${id}`, { method: 'DELETE', credentials: 'include', headers });
      if (!response.ok) throw new Error('Failed to delete article');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'articles'] });
      toast.success('Article deleted successfully');
    },
    onError: () => toast.error('Failed to delete article'),
    onSettled: () => { setActionLoading(null); setArticleToDelete(null); }
  });

  const approvePayoutMutation = useMutation({
    mutationFn: async (doctorId: string) => {
      const res = await fetch(`${API_BASE_URL}/admin/payments/onboarding-requests/${doctorId}/approve`, {
        method: 'POST',
        headers,
      });
      if (!res.ok) throw new Error('Failed to approve payout');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'payouts'] });
      toast.success('Payout account approved successfully');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to approve payout account'),
  });

  const rejectPayoutMutation = useMutation({
    mutationFn: async ({ doctorId, message }: { doctorId: string; message: string }) => {
      const res = await fetch(`${API_BASE_URL}/admin/payments/onboarding-requests/${doctorId}/reject`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error('Failed to reject payout');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'payouts'] });
      toast.success('Payout request rejected');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to reject payout request'),
  });
  const confirmDelete = () => {
    if (!articleToDelete) return;
    setActionLoading(articleToDelete.id);
    deleteArticleMutation.mutate(articleToDelete.id);
  };

  const toggleFeatureMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`${API_BASE_URL}/articles/admin/${id}/feature`, { method: 'POST', credentials: 'include', headers });
      if (!response.ok) throw new Error('Failed to feature article');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'articles'] });
      toast.success('Featured status updated');
    },
    onError: () => toast.error('An error occurred'),
    onSettled: () => setActionLoading(null)
  });
  const handleToggleFeatured = (id: string) => {
    setActionLoading(id + '-feature');
    toggleFeatureMutation.mutate(id);
  };

  const approveDoctorMutation = useMutation({
    mutationFn: async (doctorId: string) => {
      const response = await fetch(`${API_BASE_URL}/admin/approvals/doctors/${doctorId}/approve`, { method: 'POST', credentials: 'include', headers });
      if (!response.ok) throw new Error('Failed to approve');
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] })
  });
  const handleApproveDoctor = (doctorId: string) => approveDoctorMutation.mutate(doctorId);

  const rejectDoctorMutation = useMutation({
    mutationFn: async ({ doctorId, reason }: { doctorId: string; reason: string }) => {
      const hdrs = { ...headers, 'Content-Type': 'application/json' };
      const response = await fetch(`${API_BASE_URL}/admin/approvals/doctors/${doctorId}/reject`, {
        method: 'POST', credentials: 'include', headers: hdrs, body: JSON.stringify({ reason })
      });
      if (!response.ok) throw new Error('Failed to reject');
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] })
  });
  const handleRejectDoctor = (doctorId: string) => {
    const reason = prompt('Enter rejection reason:');
    if (reason === null) return;
    rejectDoctorMutation.mutate({ doctorId, reason: reason || 'No reason provided' });
  };

  const approveAdminMutation = useMutation({
    mutationFn: async (adminId: string) => {
      const response = await fetch(`${API_BASE_URL}/admin/approvals/admins/${adminId}/approve`, { method: 'POST', credentials: 'include', headers });
      if (!response.ok) throw new Error('Failed to approve admin');
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] })
  });
  const handleApproveAdmin = (adminId: string) => approveAdminMutation.mutate(adminId);

  const rejectAdminMutation = useMutation({
    mutationFn: async ({ adminId, reason }: { adminId: string; reason: string }) => {
      const hdrs = { ...headers, 'Content-Type': 'application/json' };
      const response = await fetch(`${API_BASE_URL}/admin/approvals/admins/${adminId}/reject`, {
        method: 'POST', credentials: 'include', headers: hdrs, body: JSON.stringify({ reason })
      });
      if (!response.ok) throw new Error('Failed to reject admin');
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] })
  });
  const handleRejectAdmin = (adminId: string) => {
    const reason = prompt('Enter rejection reason:');
    if (reason === null) return;
    rejectAdminMutation.mutate({ adminId, reason: reason || 'No reason provided' });
  };

  const deleteDoctorMutation = useMutation({
    mutationFn: async (doctorId: string) => {
      const response = await fetch(`${API_BASE_URL}/admin/approvals/doctors/${doctorId}`, { method: 'DELETE', credentials: 'include', headers });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to delete doctor');
      }
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
    onError: (err: any) => alert(err.message || 'Failed to delete doctor')
  });
  const handleDeleteDoctor = (doctorId: string) => {
    if (!window.confirm('Are you sure you want to remove this doctor? This action cannot be undone.')) return;
    deleteDoctorMutation.mutate(doctorId);
  };

  const deleteAdminMutation = useMutation({
    mutationFn: async (adminId: string) => {
      const response = await fetch(`${API_BASE_URL}/admin/approvals/admins/${adminId}`, { method: 'DELETE', credentials: 'include', headers });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to delete admin');
      }
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
    onError: (err: any) => alert(err.message || 'Failed to delete admin')
  });
  const handleDeleteAdmin = (adminId: string) => {
    if (!window.confirm('Are you sure you want to remove this admin? This action cannot be undone.')) return;
    deleteAdminMutation.mutate(adminId);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/admin-login');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading || adminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fcfbfa]">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 border-2 border-[#0097b2] border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-xs font-medium text-neutral-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Calculate max sessions for chart scaling
  const maxSessions = analytics?.topDoctors.reduce((max, d) => d.sessionCount > max ? d.sessionCount : max, 0) || 1;

  return (
    <div className="min-h-screen flex bg-[#fcfbfa] text-neutral-800 antialiased font-sans">
      
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <div 
        className={`fixed inset-y-0 left-0 z-50 bg-[#001e24] text-[#fff3db] transform transition-all duration-300 ease-in-out md:translate-x-0 
          ${sidebarCollapsed ? 'w-16' : 'w-60'} 
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex flex-col h-full p-4">
          {/* Logo / Brand */}
          <div className={`mb-8 pt-2 flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
            {!sidebarCollapsed && (
              <div>
                <h1 className="text-sm font-semibold tracking-wider uppercase text-[#0097b2]">Veraawell</h1>
                <p className="text-[10px] text-[#fff3db] opacity-60 mt-0.5">Control Panel</p>
              </div>
            )}
            {/* Collapse Toggle Button (Desktop Only) */}
            <button 
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)} 
              className="hidden md:flex items-center justify-center w-6 h-6 rounded-full bg-[#fff3db]/5 hover:bg-[#fff3db]/10 text-[#fff3db]/70 transition-colors"
            >
              {sidebarCollapsed ? <FiChevronRight size={12} /> : <FiChevronLeft size={12} />}
            </button>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 space-y-1">
            <button
              onClick={() => setActiveTab('analytics')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${activeTab === 'analytics' ? 'bg-[#0097b2] text-white' : 'text-[#fff3db]/70 hover:bg-[#fff3db]/5 hover:text-[#fff3db]'} ${sidebarCollapsed ? 'justify-center' : ''}`}
              title={sidebarCollapsed ? "Analytics" : ""}
            >
              {sidebarCollapsed ? (
                <div className={`w-2 h-2 rounded-full ${activeTab === 'analytics' ? 'bg-white' : 'bg-[#fff3db]/40'}`} />
              ) : (
                <FiActivity size={16} />
              )}
              {!sidebarCollapsed && <span>Analytics</span>}
            </button>
            
            <button
              onClick={() => setActiveTab('doctors')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${activeTab === 'doctors' ? 'bg-[#0097b2] text-white' : 'text-[#fff3db]/70 hover:bg-[#fff3db]/5 hover:text-[#fff3db]'} ${sidebarCollapsed ? 'justify-center' : ''}`}
              title={sidebarCollapsed ? "Pending Doctors" : ""}
            >
              {sidebarCollapsed ? (
                <div className={`w-2 h-2 rounded-full ${activeTab === 'doctors' ? 'bg-white' : 'bg-[#fff3db]/40'}`} />
              ) : (
                <LuStethoscope size={16} />
              )}
              {!sidebarCollapsed && (
                <>
                  <span>Pending Doctors</span>
                  {pendingDoctors.length > 0 && (
                    <span className="ml-auto bg-[#fff3db] text-[#001e24] text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                      {pendingDoctors.length}
                    </span>
                  )}
                </>
              )}
              {sidebarCollapsed && pendingDoctors.length > 0 && (
                <div className="absolute top-1 right-1 w-2 h-2 bg-[#fff3db] rounded-full" />
              )}
            </button>

            {admin?.role === 'super_admin' && (
              <button
                onClick={() => setActiveTab('admins')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${activeTab === 'admins' ? 'bg-[#0097b2] text-white' : 'text-[#fff3db]/70 hover:bg-[#fff3db]/5 hover:text-[#fff3db]'} ${sidebarCollapsed ? 'justify-center' : ''}`}
                title={sidebarCollapsed ? "Pending Admins" : ""}
              >
                {sidebarCollapsed ? (
                  <div className={`w-2 h-2 rounded-full ${activeTab === 'admins' ? 'bg-white' : 'bg-[#fff3db]/40'}`} />
                ) : (
                  <FiUsers size={16} />
                )}
                {!sidebarCollapsed && (
                  <>
                    <span>Pending Admins</span>
                    {pendingAdmins.length > 0 && (
                      <span className="ml-auto bg-[#fff3db] text-[#001e24] text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                        {pendingAdmins.length}
                      </span>
                    )}
                  </>
                )}
                {sidebarCollapsed && pendingAdmins.length > 0 && (
                  <div className="absolute top-1 right-1 w-2 h-2 bg-[#fff3db] rounded-full" />
                )}
              </button>
            )}

            {admin?.role === 'super_admin' && (
              <button
                onClick={() => setActiveTab('payouts')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${activeTab === 'payouts' ? 'bg-[#0097b2] text-white' : 'text-[#fff3db]/70 hover:bg-[#fff3db]/5 hover:text-[#fff3db]'} ${sidebarCollapsed ? 'justify-center' : ''}`}
                title={sidebarCollapsed ? "Payout Approvals" : ""}
              >
                {sidebarCollapsed ? (
                  <div className={`w-2 h-2 rounded-full ${activeTab === 'payouts' ? 'bg-white' : 'bg-[#fff3db]/40'}`} />
                ) : (
                  <FiClock size={16} />
                )}
                {!sidebarCollapsed && (
                  <>
                    <span>Payout Approvals</span>
                  </>
                )}
              </button>
            )}

            {admin?.role === 'super_admin' && (
              <button
                onClick={() => setActiveTab('revenue')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${activeTab === 'revenue' ? 'bg-[#0097b2] text-white' : 'text-[#fff3db]/70 hover:bg-[#fff3db]/5 hover:text-[#fff3db]'} ${sidebarCollapsed ? 'justify-center' : ''}`}
                title={sidebarCollapsed ? "Revenue" : ""}
              >
                {sidebarCollapsed ? (
                  <div className={`w-2 h-2 rounded-full ${activeTab === 'revenue' ? 'bg-white' : 'bg-[#fff3db]/40'}`} />
                ) : (
                  <FiActivity size={16} />
                )}
                {!sidebarCollapsed && <span>Revenue</span>}
              </button>
            )}
            
            <button
              onClick={() => setActiveTab('articles')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${activeTab === 'articles' ? 'bg-[#0097b2] text-white' : 'text-[#fff3db]/70 hover:bg-[#fff3db]/5 hover:text-[#fff3db]'} ${sidebarCollapsed ? 'justify-center' : ''}`}
              title={sidebarCollapsed ? "Articles" : ""}
            >
              {sidebarCollapsed ? (
                <div className={`w-2 h-2 rounded-full ${activeTab === 'articles' ? 'bg-white' : 'bg-[#fff3db]/40'}`} />
              ) : (
                <FiFileText size={16} />
              )}
              {!sidebarCollapsed && <span>Articles</span>}
            </button>
          </nav>

          {/* User & Logout */}
          <div className="border-t border-[#fff3db]/10 pt-4 mt-auto">
            {!sidebarCollapsed && (
              <div className="flex items-center gap-3 px-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-[#0097b2] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {admin?.firstName?.[0] || 'A'}
                </div>
                <div className="overflow-hidden">
                  <p className="text-xs font-medium truncate">{admin?.firstName} {admin?.lastName}</p>
                  <p className="text-[10px] text-[#fff3db]/50 truncate">{admin?.role === 'super_admin' ? 'Super Admin' : 'Admin'}</p>
                </div>
              </div>
            )}
            <button
              onClick={handleLogout}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors ${sidebarCollapsed ? 'justify-center' : ''}`}
              title={sidebarCollapsed ? "Logout" : ""}
            >
              <FiLogOut size={16} />
              {!sidebarCollapsed && <span>Logout</span>}
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Content ────────────────────────────────────────────────── */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'md:pl-16' : 'md:pl-60'}`}>
        
        {/* Header */}
        <header className="h-14 bg-white border-b border-neutral-100 flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden text-neutral-600">
              <FiMenu size={18} />
            </button>
            <h1 className="text-base font-semibold text-neutral-800 flex items-center gap-2">
              {activeTab === 'analytics' ? 'Dashboard Overview' : activeTab === 'doctors' ? 'Doctor Approvals' : activeTab === 'admins' ? 'Admin Approvals' : activeTab === 'payouts' ? 'Payout Approvals' : activeTab === 'revenue' ? 'Platform Revenue' : 'Manage Articles'}
            </h1>
          </div>
          {/* Removed non-functional search bar to keep it minimal */}
          <div className="flex items-center gap-4">
            {activeTab === 'articles' ? (
              <button
                onClick={() => navigate('/super-admin-dashboard/articles/new')}
                className="px-4 py-2 bg-[#0097b2] hover:bg-[#007c93] text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5"
              >
                <Plus size={14} />
                New Article
              </button>
            ) : (
              <div className="text-xs text-neutral-500 font-medium">
                Welcome back, {admin?.firstName}
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-6 overflow-auto space-y-6">
          
          {/* Stats Grid - Enhanced with larger numbers and cleaner look */}
          {statistics && activeTab === 'analytics' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Pending Doctors</span>
                  <div className="p-2 bg-amber-50 text-amber-600 rounded-xl"><FiClock size={16} /></div>
                </div>
                <p className="text-4xl font-bold text-neutral-900">{statistics.doctors.pending}</p>
                <p className="text-[11px] text-neutral-500 mt-1 font-medium">Requires review</p>
              </div>
              
              <div className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Total Doctors</span>
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><FiUserCheck size={16} /></div>
                </div>
                <p className="text-4xl font-bold text-neutral-900">{statistics.doctors.approved}</p>
                <p className="text-[11px] text-emerald-600 font-semibold mt-1">Active practitioners</p>
              </div>
              
              <div className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm hover:shadow-md transition-shadow sm:col-span-2 lg:col-span-1">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Total Patients</span>
                  <div className="p-2 bg-[#0097b2]/10 text-[#0097b2] rounded-xl"><FiUsers size={16} /></div>
                </div>
                <p className="text-4xl font-bold text-neutral-900">{statistics.patients.total}</p>
                <p className="text-[11px] text-neutral-500 mt-1 font-medium">Registered users</p>
              </div>
            </div>
          )}

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            {/* ── Analytics Tab ─────────────────────────────────────────── */}
            {activeTab === 'analytics' && analytics && (
              <motion.div key="analytics" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                
                {/* Analytics Mini Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white p-5 rounded-2xl border border-neutral-100 shadow-sm">
                    <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Total Sessions</p>
                    <p className="text-3xl font-bold text-neutral-900">{analytics.sessions.total}</p>
                    <p className="text-[11px] text-emerald-600 font-semibold mt-1">+{analytics.sessions.last7Days} this week</p>
                  </div>
                  <div className="bg-white p-5 rounded-2xl border border-neutral-100 shadow-sm">
                    <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Total Revenue</p>
                    <p className="text-3xl font-bold text-neutral-900">₹{analytics.revenue.total.toLocaleString()}</p>
                    <p className="text-[11px] text-neutral-500 mt-1">₹{analytics.revenue.last30Days.toLocaleString()} (30d)</p>
                  </div>
                  <div className="bg-white p-5 rounded-2xl border border-neutral-100 shadow-sm">
                    <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Reports Created</p>
                    <p className="text-3xl font-bold text-neutral-900">{analytics.content.reports}</p>
                    <p className="text-[11px] text-neutral-500 mt-1">{analytics.content.tasks} tasks assigned</p>
                  </div>
                  <div className="bg-white p-5 rounded-2xl border border-neutral-100 shadow-sm">
                    <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2">User Growth</p>
                    <p className="text-3xl font-bold text-neutral-900">+{analytics.growth.newPatients30Days}</p>
                    <p className="text-[11px] text-neutral-500 mt-1">New patients (30d)</p>
                  </div>
                </div>

                {/* Detailed Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Session Status */}
                  <div className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm">
                    <h3 className="text-sm font-semibold text-neutral-900 mb-5">Session Breakdown</h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-neutral-500 font-medium">Completed</span>
                        <span className="font-bold text-emerald-600 text-sm">{analytics.sessions.completed}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-neutral-500 font-medium">Upcoming</span>
                        <span className="font-bold text-blue-600 text-sm">{analytics.sessions.upcoming}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-neutral-500 font-medium">Cancelled</span>
                        <span className="font-bold text-red-600 text-sm">{analytics.sessions.cancelled}</span>
                      </div>
                      <div className="pt-4 border-t border-neutral-50 flex justify-between items-center text-xs">
                        <span className="font-semibold text-neutral-700">Avg. Revenue / Session</span>
                        <span className="font-bold text-[#0097b2] text-sm">₹{analytics.revenue.averagePerSession}</span>
                      </div>
                    </div>
                  </div>

                  {/* Top Doctors with Visual Chart */}
                  <div className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm">
                    <h3 className="text-sm font-semibold text-neutral-900 mb-5">Top Performing Doctors</h3>
                    <div className="space-y-4">
                      {analytics.topDoctors.length === 0 ? (
                        <p className="text-xs text-neutral-400 text-center py-4">No data available</p>
                      ) : (
                        analytics.topDoctors.map((doctor, index) => {
                          const percentage = (doctor.sessionCount / maxSessions) * 100;
                          return (
                            <div key={index} className="space-y-1.5">
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-neutral-700 font-medium">{index + 1}. Dr. {doctor.name}</span>
                                <span className="font-bold text-[#0097b2]">{doctor.sessionCount} sessions</span>
                              </div>
                              <div className="w-full h-1.5 bg-neutral-50 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-[#0097b2] rounded-full transition-all duration-500" 
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Doctors Tab ─────────────────────────────────────── */}
            {activeTab === 'doctors' && (
              <motion.div key="doctors" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                
                {/* View Mode Toggle */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setDoctorViewMode('pending')}
                    className={`px-4 py-2 text-xs font-semibold rounded-xl transition-colors ${doctorViewMode === 'pending' ? 'bg-[#0097b2] text-white' : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50'}`}
                  >
                    Pending Approvals ({pendingDoctors.length})
                  </button>
                  <button
                    onClick={() => setDoctorViewMode('all')}
                    className={`px-4 py-2 text-xs font-semibold rounded-xl transition-colors ${doctorViewMode === 'all' ? 'bg-[#0097b2] text-white' : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50'}`}
                  >
                    All Doctors ({allDoctors.length})
                  </button>
                </div>

                {(doctorViewMode === 'pending' ? pendingDoctors : allDoctors).length === 0 ? (
                  <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-12 text-center">
                    <FiUserCheck size={28} className="text-neutral-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-neutral-500">
                      {doctorViewMode === 'pending' ? 'No pending doctor requests' : 'No doctors found'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(doctorViewMode === 'pending' ? pendingDoctors : allDoctors).map((user) => (
                      <div key={user._id} className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm flex flex-col md:flex-row justify-between gap-4 hover:shadow-md transition-shadow">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-neutral-900">Dr. {user.firstName} {user.lastName}</h3>
                            {user.approvalStatus === 'approved' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-medium border border-emerald-200">
                                Approved
                              </span>
                            )}
                            {user.approvalStatus === 'pending' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[10px] font-medium border border-amber-200">
                                Pending
                              </span>
                            )}
                            {user.approvalStatus === 'rejected' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 bg-red-50 text-red-700 rounded-full text-[10px] font-medium border border-red-200">
                                Rejected
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-500">{user.email}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-600 pt-1">
                            {user.phoneNumber && <span><span className="font-medium text-neutral-400">Phone:</span> +{user.countryCode || '91'} {user.phoneNumber}</span>}
                            {user.gender && <span><span className="font-medium text-neutral-400">Gender:</span> {user.gender}</span>}
                            {user.dateOfBirth && <span><span className="font-medium text-neutral-400">DOB:</span> {formatDate(user.dateOfBirth)}</span>}
                            {user.jobRole && <span><span className="font-medium text-neutral-400">Role:</span> {user.jobRole}</span>}
                            {user.specialization && <span><span className="font-medium text-neutral-400">Specialization:</span> {user.specialization}</span>}
                            {user.licenseNumber && <span><span className="font-medium text-neutral-400">License:</span> {user.licenseNumber}</span>}
                            {user.heardAboutUs && <span><span className="font-medium text-neutral-400">Source:</span> {user.heardAboutUs}</span>}
                          </div>
                          {user.professionalMessage && (
                            <p className="text-[11px] text-neutral-600 bg-neutral-50 p-2.5 rounded-xl mt-2 border border-neutral-100">
                              <span className="font-semibold text-neutral-400">Message:</span> "{user.professionalMessage}"
                            </p>
                          )}
                          
                          {/* Documents */}
                          {user.documents && user.documents.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {user.documents.map((doc, index) => (
                                <button
                                  key={index}
                                  onClick={() => setViewingDocument({ url: doc.fileUrl, fileName: doc.fileName, fileType: doc.fileType })}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-50 border border-neutral-100 text-neutral-600 rounded-xl hover:bg-neutral-100 transition-colors text-[10px] font-semibold"
                                >
                                  <FiFileText size={12} className="text-neutral-400" />
                                  {doc.fileName.length > 15 ? doc.fileName.substring(0, 15) + '...' : doc.fileName}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex md:flex-col justify-end gap-2">
                          {user.approvalStatus === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApproveDoctor(user._id)}
                                className="px-4 py-2 bg-[#0097b2] hover:bg-[#007c93] text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                              >
                                <FiCheck size={14} />
                                Approve
                              </button>
                              <button
                                onClick={() => handleRejectDoctor(user._id)}
                                className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                              >
                                <FiX size={14} />
                                Reject
                              </button>
                            </>
                          )}
                          {admin?.role === 'super_admin' && (
                            <button
                              onClick={() => handleDeleteDoctor(user._id)}
                              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                            >
                              <Trash2 size={14} />
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Admins Tab ──────────────────────────────────────── */}
            {activeTab === 'admins' && admin?.role === 'super_admin' && (
              <motion.div key="admins" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                
                {/* View Mode Toggle */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setAdminViewMode('pending')}
                    className={`px-4 py-2 text-xs font-semibold rounded-xl transition-colors ${adminViewMode === 'pending' ? 'bg-[#0097b2] text-white' : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50'}`}
                  >
                    Pending Approvals ({pendingAdmins.length})
                  </button>
                  <button
                    onClick={() => setAdminViewMode('all')}
                    className={`px-4 py-2 text-xs font-semibold rounded-xl transition-colors ${adminViewMode === 'all' ? 'bg-[#0097b2] text-white' : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50'}`}
                  >
                    All Admins ({allAdmins.length})
                  </button>
                </div>

                {(adminViewMode === 'pending' ? pendingAdmins : allAdmins).length === 0 ? (
                  <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-12 text-center">
                    <FiUsers size={28} className="text-neutral-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-neutral-500">
                      {adminViewMode === 'pending' ? 'No pending admin requests' : 'No admins found'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(adminViewMode === 'pending' ? pendingAdmins : allAdmins).map((user) => (
                      <div key={user._id} className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm flex flex-col md:flex-row justify-between gap-4 hover:shadow-md transition-shadow">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-neutral-900">{user.firstName} {user.lastName}</h3>
                            {user.approvalStatus === 'approved' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-medium border border-emerald-200">
                                Approved
                              </span>
                            )}
                            {user.approvalStatus === 'pending' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[10px] font-medium border border-amber-200">
                                Pending
                              </span>
                            )}
                            {user.approvalStatus === 'rejected' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 bg-red-50 text-red-700 rounded-full text-[10px] font-medium border border-red-200">
                                Rejected
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-500">{user.email}</p>
                          <p className="text-[11px] text-neutral-600 pt-1">
                            <span className="font-medium text-neutral-400">Role:</span> {user.role}
                          </p>
                          <p className="text-[11px] text-neutral-400">
                            Registered on {formatDate(user.createdAt)}
                          </p>
                        </div>
                        
                        <div className="flex md:flex-col justify-end gap-2">
                          {user.approvalStatus === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApproveAdmin(user._id)}
                                className="px-4 py-2 bg-[#0097b2] hover:bg-[#007c93] text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                              >
                                <FiCheck size={14} />
                                Approve
                              </button>
                              <button
                                onClick={() => handleRejectAdmin(user._id)}
                                className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                              >
                                <FiX size={14} />
                                Reject
                              </button>
                            </>
                          )}
                          {admin?.role === 'super_admin' && user._id !== (admin as any)._id && (
                            <button
                              onClick={() => handleDeleteAdmin(user._id)}
                              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                            >
                              <Trash2 size={14} />
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Payouts Tab ──────────────────────────────────────── */}
            {activeTab === 'payouts' && admin?.role === 'super_admin' && (
              <motion.div key="payouts" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                
                {/* View Mode Toggle */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setPayoutViewMode('pending')}
                    className={`px-4 py-2 text-xs font-semibold rounded-xl transition-colors ${payoutViewMode === 'pending' ? 'bg-[#0097b2] text-white' : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50'}`}
                  >
                    Pending Approvals
                  </button>
                  <button
                    onClick={() => setPayoutViewMode('active')}
                    className={`px-4 py-2 text-xs font-semibold rounded-xl transition-colors ${payoutViewMode === 'active' ? 'bg-[#0097b2] text-white' : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50'}`}
                  >
                    Approved Accounts
                  </button>
                </div>

                {payoutRequests.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-12 text-center">
                    <FiClock size={28} className="text-neutral-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-neutral-500">
                      {payoutViewMode === 'pending' ? 'No pending payout requests' : 'No approved payout accounts'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {payoutRequests.map((request: any) => (
                      <div key={request.doctorId} className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm flex flex-col md:flex-row justify-between gap-4 hover:shadow-md transition-shadow">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-neutral-900">Dr. {request.name}</h3>
                            {payoutViewMode === 'pending' ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[10px] font-medium border border-amber-200">
                                Pending
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-medium border border-emerald-200">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-500">{request.email}</p>
                          <p className="text-[11px] text-neutral-600 pt-1">
                            <span className="font-medium text-neutral-400">Razorpay ID:</span> {request.razorpayAccountId || 'N/A'}
                          </p>
                          <p className="text-[11px] text-neutral-400">
                            Requested on {formatDate(request.requestedAt)}
                          </p>
                        </div>
                        
                        {payoutViewMode === 'pending' && (
                          <div className="flex md:flex-col justify-end gap-2">
                            <button
                              onClick={() => setPayoutModal({ isOpen: true, type: 'approve', request })}
                              disabled={approvePayoutMutation.isPending}
                              className="px-4 py-2 bg-[#0097b2] hover:bg-[#007c93] text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              <FiCheck size={14} />
                              Approve
                            </button>
                            <button
                              onClick={() => setPayoutModal({ isOpen: true, type: 'reject', request })}
                              disabled={rejectPayoutMutation.isPending}
                              className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              <FiX size={14} />
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Revenue Tab ────────────────────────────────────────────── */}
            {activeTab === 'revenue' && admin?.role === 'super_admin' && (
              <motion.div key="revenue" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                
                {revenueLoading ? (
                  <div className="flex justify-center py-20">
                    <div className="w-8 h-8 border-4 border-[#0097b2] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Summary Cards */}
                      <div className="bg-white p-5 rounded-2xl border border-neutral-100 shadow-sm flex flex-col justify-center">
                        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Gross Revenue</p>
                        <p className="text-2xl font-bold text-neutral-900">₹ {(revenueData?.summary?.totalRevenue || 0).toLocaleString()}</p>
                      </div>
                      <div className="bg-white p-5 rounded-2xl border border-neutral-100 shadow-sm flex flex-col justify-center">
                        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Platform Fee</p>
                        <p className="text-2xl font-bold text-emerald-600">₹ {(revenueData?.summary?.totalPlatformFee || 0).toLocaleString()}</p>
                      </div>
                      <div className="bg-white p-5 rounded-2xl border border-neutral-100 shadow-sm flex flex-col justify-center">
                        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Doctor Earnings</p>
                        <p className="text-2xl font-bold text-neutral-900">₹ {(revenueData?.summary?.totalDoctorEarnings || 0).toLocaleString()}</p>
                      </div>
                      <div className="bg-white p-5 rounded-2xl border border-neutral-100 shadow-sm flex flex-col justify-center">
                        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Total Sessions</p>
                        <p className="text-2xl font-bold text-neutral-900">{revenueData?.summary?.totalSessions || 0}</p>
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b border-neutral-100 bg-neutral-50/50">
                        <h3 className="text-sm font-semibold text-neutral-800">Doctor Earnings Breakdown</h3>
                      </div>
                      
                      {(!revenueData?.topDoctors || revenueData.topDoctors.length === 0) ? (
                        <div className="p-8 text-center">
                          <p className="text-sm text-neutral-500">No revenue data available for this period.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-neutral-50/50 text-neutral-500 text-[11px] font-semibold uppercase tracking-wider border-b border-neutral-100">
                                <th className="p-4 pl-6 font-medium">Doctor Name</th>
                                <th className="p-4 font-medium">Sessions</th>
                                <th className="p-4 font-medium">Gross Revenue</th>
                                <th className="p-4 font-medium text-emerald-600">Platform Fee</th>
                                <th className="p-4 font-medium text-[#0097b2]">Net Payout</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                              {revenueData.topDoctors.map((doc: any) => (
                                <tr key={doc._id} className="hover:bg-neutral-50/50 transition-colors">
                                  <td className="p-4 pl-6">
                                    <div className="text-sm font-semibold text-neutral-900">{doc.name}</div>
                                    <div className="text-[11px] text-neutral-500">{doc.email}</div>
                                  </td>
                                  <td className="p-4 text-sm text-neutral-700">{doc.sessions}</td>
                                  <td className="p-4 text-sm text-neutral-700 font-medium">₹ {doc.grossRevenue.toLocaleString()}</td>
                                  <td className="p-4 text-sm text-emerald-600 font-medium">₹ {doc.platformFee.toLocaleString()}</td>
                                  <td className="p-4 text-sm text-[#0097b2] font-semibold">₹ {doc.doctorEarnings.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {/* ── Articles Tab ────────────────────────────────────────────── */}
            {activeTab === 'articles' && (
              <motion.div key="articles" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                
                {/* Filters */}
                <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Search */}
                    <div className="md:col-span-2 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-400" />
                      <input
                        type="text"
                        placeholder="Search by title..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-xs bg-neutral-50 rounded-lg border border-neutral-200 focus:outline-none focus:border-[#0097b2]"
                      />
                    </div>

                    {/* Category Filter */}
                    <div className="relative">
                      <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-400" />
                      <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 text-xs bg-neutral-50 rounded-lg border border-neutral-200 focus:outline-none focus:border-[#0097b2] appearance-none"
                      >
                        {[
                          'All', 'Addiction', 'Adult ADHD', 'Anger management', 'Anger & Frustration',
                          'Anxiety disorders', 'Bipolar disorder', 'Confusion about identity',
                          'Depression', 'Depressive disorders', 'Lack of Motivation',
                          'Negative thinking', 'Relationship Struggles'
                        ].map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>

                    {/* Status Filter */}
                    <div className="relative">
                      <select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        className="w-full px-4 py-2 text-xs bg-neutral-50 rounded-lg border border-neutral-200 focus:outline-none focus:border-[#0097b2] appearance-none"
                      >
                        <option value="All">All Status</option>
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Table / List */}
                <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
                  {articlesLoading ? (
                    <div className="p-12 text-center">
                      <div className="w-6 h-6 border-2 border-[#0097b2] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                      <p className="text-neutral-400 text-xs font-medium">Loading articles...</p>
                    </div>
                  ) : articles.length === 0 ? (
                    <div className="p-12 text-center">
                      <FiFileText size={28} className="text-neutral-200 mx-auto mb-3" />
                      <h3 className="text-sm font-semibold text-neutral-900 mb-1">No articles found</h3>
                      <p className="text-neutral-500 text-xs mb-4">
                        {searchQuery || selectedCategory !== 'All'
                          ? 'Try adjusting your search or filters'
                          : 'Get started by creating a new article'}
                      </p>
                      {(searchQuery || selectedCategory !== 'All') && (
                        <button
                          onClick={() => {
                            setSearchQuery('');
                            setSelectedCategory('All');
                            setSelectedStatus('All');
                          }}
                          className="text-[#0097b2] font-semibold hover:text-[#007c93] text-xs"
                        >
                          Clear all filters
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-neutral-50 border-b border-neutral-100">
                              <th className="px-6 py-3 text-[11px] font-bold text-neutral-400 uppercase tracking-wider w-1/2">Article</th>
                              <th className="px-6 py-3 text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Status</th>
                              <th className="px-6 py-3 text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Stats</th>
                              <th className="px-6 py-3 text-[11px] font-bold text-neutral-400 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100">
                            {articles.map((article) => (
                              <tr key={article._id} className="hover:bg-neutral-50/50 transition-colors group">
                                <td className="px-6 py-4">
                                  <div className="flex flex-col">
                                    <span className="text-sm font-semibold text-neutral-800 mb-1 line-clamp-1 group-hover:text-[#0097b2] transition-colors">
                                      {article.title}
                                    </span>
                                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                                      <span className="bg-neutral-50 px-2 py-0.5 rounded border border-neutral-100 text-[10px] font-medium">
                                        {article.category}
                                      </span>
                                      <span>•</span>
                                      <span>{new Date(article.createdAt).toLocaleDateString()}</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  {article.status === 'published' ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium border border-emerald-200">
                                      <CheckCircle size={12} />
                                      Published
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-50 text-amber-700 rounded-full text-xs font-medium border border-amber-200">
                                      <Clock size={12} />
                                      Draft
                                    </span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-xs text-neutral-500">
                                  <div className="flex items-center gap-3">
                                    <span className="flex items-center gap-1" title="Views">
                                      <Eye size={14} className="text-neutral-400" />
                                      {article.views}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleFeatured(article._id);
                                      }}
                                      disabled={actionLoading !== null}
                                      className={`p-1.5 rounded-lg hover:bg-neutral-50 transition-colors ${article.featured ? 'text-amber-500' : 'text-neutral-400 hover:text-amber-500'} disabled:opacity-50`}
                                      title={article.featured ? "Unfeature" : "Feature"}
                                    >
                                      {actionLoading === article._id + '-feature' ? <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /> : <Plus size={14} className={`${article.featured ? 'fill-current' : ''}`} />}
                                    </button>
                                    <button
                                      onClick={() => navigate(`/super-admin-dashboard/articles/edit/${article._id}`)}
                                      className="p-1.5 text-blue-600 hover:bg-neutral-50 rounded-lg transition-colors disabled:opacity-50"
                                      title="Edit"
                                      disabled={actionLoading !== null}
                                    >
                                      <Edit size={14} />
                                    </button>
                                    <button
                                      onClick={() => setArticleToDelete({ id: article._id, title: article.title })}
                                      className="p-1.5 text-red-600 hover:bg-neutral-50 rounded-lg transition-colors disabled:opacity-50"
                                      title="Delete"
                                      disabled={actionLoading !== null}
                                    >
                                      {actionLoading === article._id ? <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /> : <Trash2 size={14} />}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination */}
                      {pagination && pagination.pages > 1 && (
                        <div className="px-6 py-4 border-t border-neutral-100 flex items-center justify-between">
                          <div className="text-xs text-neutral-500 font-medium">
                            Showing <span className="font-semibold text-neutral-800">{((page - 1) * pagination.limit) + 1}</span> to <span className="font-semibold text-neutral-800">{Math.min(page * pagination.limit, pagination.total)}</span> of <span className="font-semibold text-neutral-800">{pagination.total}</span> results
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setPage(p => Math.max(1, p - 1))}
                              disabled={page === 1}
                              className="p-1.5 border border-neutral-200 rounded-lg hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              <FiChevronLeft size={14} className="text-neutral-600" />
                            </button>
                            <button
                              onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                              disabled={page === pagination.pages}
                              className="p-1.5 border border-neutral-200 rounded-lg hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              <FiChevronRight size={14} className="text-neutral-600" />
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            )}

      {/* Delete Article Modal */}
      <AnimatePresence>
        {articleToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setArticleToDelete(null)}>
            <div className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-lg max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-neutral-900 mb-1">Delete Article</h3>
              <p className="text-xs text-neutral-500 mb-6">Are you sure you want to delete <span className="font-semibold text-neutral-700">"{articleToDelete.title}"</span>? This action cannot be undone.</p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setArticleToDelete(null)}
                  className="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={actionLoading !== null}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  {actionLoading === articleToDelete.id ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Trash2 size={14} />}
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
      {/* Payout Approval/Rejection Modal */}
      <AnimatePresence>
        {payoutModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setPayoutModal(null)}>
            <div className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-lg max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-neutral-900 mb-1">
                {payoutModal.type === 'approve' ? 'Approve Payout Account' : 'Reject Payout Account'}
              </h3>
              
              {payoutModal.type === 'approve' ? (
                <p className="text-xs text-neutral-500 mb-6">
                  Are you sure you want to approve the Razorpay account for <span className="font-semibold text-neutral-700">Dr. {payoutModal.request.name}</span>? 
                  Once approved, their 80% split will be automatically routed to this account.
                </p>
              ) : (
                <div className="mb-6 mt-4">
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">Reason for Rejection</label>
                  <textarea
                    value={payoutRejectReason}
                    onChange={(e) => setPayoutRejectReason(e.target.value)}
                    placeholder="Enter the reason for rejecting this payout request..."
                    className="w-full p-3 text-xs bg-neutral-50 rounded-lg border border-neutral-200 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 min-h-[80px]"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setPayoutModal(null);
                    setPayoutRejectReason('');
                  }}
                  className="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                {payoutModal.type === 'approve' ? (
                  <button
                    onClick={() => {
                      approvePayoutMutation.mutate(payoutModal.request.doctorId, {
                        onSuccess: () => setPayoutModal(null)
                      });
                    }}
                    disabled={approvePayoutMutation.isPending}
                    className="px-4 py-2 bg-[#0097b2] text-white rounded-lg hover:bg-[#007c93] text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    {approvePayoutMutation.isPending ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FiCheck size={14} />}
                    Approve
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      rejectPayoutMutation.mutate({ doctorId: payoutModal.request.doctorId, message: payoutRejectReason }, {
                        onSuccess: () => {
                          setPayoutModal(null);
                          setPayoutRejectReason('');
                        }
                      });
                    }}
                    disabled={rejectPayoutMutation.isPending || !payoutRejectReason.trim()}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-xs font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {rejectPayoutMutation.isPending ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FiX size={14} />}
                    Reject
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
          </AnimatePresence>
        </main>
      </div>

      {/* ── Document Viewer Modal ────────────────────────────────────────── */}
      <AnimatePresence>
        {viewingDocument && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setViewingDocument(null)}>
            <div className="relative w-full h-full max-w-5xl mx-auto p-4 flex flex-col" onClick={(e) => e.stopPropagation()}>
              
              {/* Header */}
              <div className="flex justify-between items-center mb-4 text-white">
                <h3 className="text-sm font-semibold truncate max-w-2xl">{viewingDocument.fileName}</h3>
                <div className="flex items-center gap-3">
                  <a
                    href={viewingDocument.url}
                    download={viewingDocument.fileName}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium"
                  >
                    Download
                  </a>
                  <button
                    onClick={() => setViewingDocument(null)}
                    className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                  >
                    <FiX size={18} />
                  </button>
                </div>
              </div>

              {/* Content Area */}
              <div className="flex-1 flex items-center justify-center rounded-2xl overflow-hidden bg-white">
                {viewingDocument.fileType === 'application/pdf' ? (
                  <iframe
                    src={`https://docs.google.com/viewer?url=${encodeURIComponent(viewingDocument.url)}&embedded=true`}
                    className="w-full h-full"
                    title={viewingDocument.fileName}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-4">
                    <img
                      src={viewingDocument.url}
                      alt={viewingDocument.fileName}
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SuperAdminDashboard;
