import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdmin } from '../context/AdminContext';
import {
    FileText, Plus, Edit, Trash2, Star, Eye, Search,
    Filter, Loader2, AlertCircle, CheckCircle, Clock, ChevronLeft, ChevronRight,
    Menu, LogOut, Activity, ChevronLeftSquare, ChevronRightSquare
} from 'lucide-react';
import { LuStethoscope } from 'react-icons/lu';
import toast from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { API_BASE_URL } from '../config/api';

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

const AdminArticlesPage: React.FC = () => {
    const navigate = useNavigate();
    const { admin, logout } = useAdmin();
    const [articles, setArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);

    // Sidebar States
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    // Filters & Pagination
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedStatus, setSelectedStatus] = useState('All');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState<PaginationData | null>(null);

    // UX States
    const [articleToDelete, setArticleToDelete] = useState<{ id: string, title: string } | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const categories = [
        'All', 'Addiction', 'Adult ADHD', 'Anger management', 'Anger & Frustration',
        'Anxiety disorders', 'Bipolar disorder', 'Confusion about identity',
        'Depression', 'Depressive disorders', 'Lack of Motivation',
        'Negative thinking', 'Relationship Struggles'
    ];

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (debouncedSearch !== searchQuery) {
                setDebouncedSearch(searchQuery);
                setPage(1);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery, debouncedSearch]);

    // Reset page when filters change
    useEffect(() => {
        setPage(1);
    }, [selectedCategory, selectedStatus]);

    useEffect(() => {
        if (!admin) {
            navigate('/admin-login');
            return;
        }
        fetchArticles();
    }, [admin, debouncedSearch, selectedCategory, selectedStatus, page]);

    const fetchArticles = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('adminToken');
            const headers: HeadersInit = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

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

            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data)) {
                    setArticles(data);
                    setPagination(null);
                } else {
                    setArticles(data.articles);
                    setPagination(data.pagination);
                }
            }
        } catch (error) {
            console.error('Error fetching articles:', error);
            toast.error('Failed to load articles');
        } finally {
            setLoading(false);
        }
    };

    const confirmDelete = async () => {
        if (!articleToDelete) return;
        const { id } = articleToDelete;
        setActionLoading(id);

        try {
            const token = localStorage.getItem('adminToken');
            const headers: HeadersInit = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(`${API_BASE_URL}/articles/admin/${id}`, {
                method: 'DELETE',
                credentials: 'include',
                headers
            });

            if (response.ok) {
                setArticles(articles.filter(a => a._id !== id));
                toast.success('Article deleted successfully');
            } else {
                toast.error('Failed to delete article');
            }
        } catch (error) {
            console.error('Error deleting article:', error);
            toast.error('Failed to delete article');
        } finally {
            setActionLoading(null);
            setArticleToDelete(null);
        }
    };

    const handleToggleFeatured = async (id: string) => {
        setActionLoading(id + '-feature');
        try {
            const token = localStorage.getItem('adminToken');
            const headers: HeadersInit = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(`${API_BASE_URL}/articles/admin/${id}/feature`, {
                method: 'POST',
                credentials: 'include',
                headers
            });

            if (response.ok) {
                fetchArticles();
                toast.success('Featured status updated');
            }
        } catch (error) {
            console.error('Error toggling featured:', error);
            toast.error('An error occurred');
        } finally {
            setActionLoading(null);
        }
    };

    const handleLogout = async () => {
        await logout();
        navigate('/admin-login');
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'published':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-600 rounded-lg text-[11px] font-bold tracking-wide border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Published
                    </span>
                );
            case 'draft':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-600 rounded-lg text-[11px] font-bold tracking-wide border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]">
                        <Clock className="w-3.5 h-3.5" />
                        Draft
                    </span>
                );
            case 'archived':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-neutral-500/10 text-neutral-600 rounded-lg text-[11px] font-bold tracking-wide border border-neutral-500/20">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Archived
                    </span>
                );
            default:
                return null;
        }
    };

    return (
        <div className="min-h-screen flex bg-[#fcfbfa] text-neutral-800 antialiased font-sans">
            
            {/* ── Sidebar (Consistent with Dashboard) ─────────────────────── */}
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
                        
                        <button 
                            onClick={() => setSidebarCollapsed(!sidebarCollapsed)} 
                            className="hidden md:flex items-center justify-center w-6 h-6 rounded-full bg-[#fff3db]/5 hover:bg-[#fff3db]/10 text-[#fff3db]/70 transition-colors"
                        >
                            {sidebarCollapsed ? <ChevronRightSquare size={14} /> : <ChevronLeftSquare size={14} />}
                        </button>
                    </div>

                    {/* Nav Links */}
                    <nav className="flex-1 space-y-1">
                        <button
                            onClick={() => navigate('/super-admin-dashboard')}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-[#fff3db]/70 hover:bg-[#fff3db]/5 hover:text-[#fff3db] transition-colors ${sidebarCollapsed ? 'justify-center' : ''}`}
                            title={sidebarCollapsed ? "Dashboard" : ""}
                        >
                            {sidebarCollapsed ? (
                                <div className="w-2 h-2 rounded-full bg-[#fff3db]/40" />
                            ) : (
                                <Activity size={16} />
                            )}
                            {!sidebarCollapsed && <span>Dashboard</span>}
                        </button>
                        
                        <button
                            onClick={() => navigate('/super-admin-dashboard')} // Fallback, usually opens dash with tab
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-[#fff3db]/70 hover:bg-[#fff3db]/5 hover:text-[#fff3db] transition-colors ${sidebarCollapsed ? 'justify-center' : ''}`}
                            title={sidebarCollapsed ? "Pending Doctors" : ""}
                        >
                            {sidebarCollapsed ? (
                                <div className="w-2 h-2 rounded-full bg-[#fff3db]/40" />
                            ) : (
                                <LuStethoscope size={16} />
                            )}
                            {!sidebarCollapsed && <span>Pending Doctors</span>}
                        </button>

                        <button
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium bg-[#0097b2] text-white transition-colors justify-center md:justify-start"
                            title={sidebarCollapsed ? "Articles" : ""}
                        >
                            {sidebarCollapsed ? (
                                <div className="w-2 h-2 rounded-full bg-white" />
                            ) : (
                                <FileText size={16} />
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
                            <LogOut size={16} />
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
                            <Menu size={18} />
                        </button>
                        <h1 className="text-sm font-semibold text-neutral-900">Manage Articles</h1>
                    </div>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => navigate('/admin/articles/new')}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#0097b2] to-[#007c93] hover:from-[#007c93] hover:to-[#005f73] text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-[#0097b2]/20"
                    >
                        <Plus className="w-4 h-4" />
                        New Article
                    </motion.button>
                </header>

                {/* Content */}
                <main className="flex-1 p-6 overflow-auto space-y-6">
                    
                    {/* Filters */}
                    <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            {/* Search */}
                            <div className="md:col-span-2 relative group">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-400 group-focus-within:text-[#0097b2] transition-colors" />
                                <input
                                    type="text"
                                    placeholder="Search by title..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 text-xs bg-white rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] transition-all shadow-sm"
                                />
                            </div>

                            {/* Category Filter */}
                            <div className="relative group">
                                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-400 group-focus-within:text-[#0097b2] transition-colors" />
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    className="w-full pl-9 pr-8 py-2.5 text-xs bg-white rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] appearance-none transition-all shadow-sm"
                                >
                                    {categories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Status Filter */}
                            <div className="relative group">
                                <select
                                    value={selectedStatus}
                                    onChange={(e) => setSelectedStatus(e.target.value)}
                                    className="w-full px-4 py-2.5 text-xs bg-white rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] appearance-none transition-all shadow-sm"
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
                        {loading ? (
                            <div className="p-12 text-center">
                                <Loader2 className="w-6 h-6 text-[#0097b2] animate-spin mx-auto mb-2" />
                                <p className="text-neutral-400 text-xs font-medium">Loading articles...</p>
                            </div>
                        ) : articles.length === 0 ? (
                            <div className="p-12 text-center">
                                <FileText className="w-8 h-8 text-neutral-200 mx-auto mb-3" />
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
                                            <AnimatePresence>
                                            {articles.map((article, index) => (
                                                <motion.tr 
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.95 }}
                                                    transition={{ delay: index * 0.05 }}
                                                    key={article._id} 
                                                    onClick={() => navigate(`/admin/articles/edit/${article._id}`)}
                                                    className="hover:bg-[#0097b2]/5 transition-colors group cursor-pointer"
                                                >
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
                                                        {getStatusBadge(article.status)}
                                                    </td>
                                                    <td className="px-6 py-4 text-xs text-neutral-500">
                                                        <div className="flex items-center gap-3">
                                                            <span className="flex items-center gap-1" title="Views">
                                                                <Eye className="w-3.5 h-3.5 text-neutral-400" />
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
                                                                className={`p-2 rounded-xl transition-all ${article.featured ? 'bg-amber-50 text-amber-500 hover:bg-amber-100' : 'text-neutral-400 hover:text-amber-500 hover:bg-amber-50'} disabled:opacity-50`}
                                                                title={article.featured ? "Unfeature" : "Feature"}
                                                            >
                                                                {actionLoading === article._id + '-feature' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className={`w-4 h-4 ${article.featured ? 'fill-current' : ''}`} />}
                                                            </button>
                                                            <button
                                                                onClick={() => navigate(`/admin/articles/edit/${article._id}`)}
                                                                className="p-2 text-blue-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all disabled:opacity-50"
                                                                title="Edit"
                                                                disabled={actionLoading !== null}
                                                            >
                                                                <Edit className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => setArticleToDelete({ id: article._id, title: article.title })}
                                                                className="p-2 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all disabled:opacity-50"
                                                                title="Delete"
                                                                disabled={actionLoading !== null}
                                                            >
                                                                {actionLoading === article._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </motion.tr>
                                            ))}
                                            </AnimatePresence>
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
                                                <ChevronLeft className="w-4 h-4 text-neutral-600" />
                                            </button>
                                            <button
                                                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                                                disabled={page === pagination.pages}
                                                className="p-1.5 border border-neutral-200 rounded-lg hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            >
                                                <ChevronRight className="w-4 h-4 text-neutral-600" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </main>
            </div>

            {/* Delete Confirmation Modal */}
            <AnimatePresence>
                {articleToDelete && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setArticleToDelete(null)}>
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="p-6">
                                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mb-4">
                                    <AlertCircle className="w-5 h-5 text-red-600" />
                                </div>
                                <h3 className="text-base font-semibold text-neutral-900 mb-1">Delete Article</h3>
                                <p className="text-xs text-neutral-500 mb-6">
                                    Are you sure you want to delete <span className="font-semibold text-neutral-900">"{articleToDelete.title}"</span>? This action cannot be undone.
                                </p>
                                <div className="flex gap-2 justify-end">
                                    <button
                                        onClick={() => setArticleToDelete(null)}
                                        disabled={actionLoading !== null}
                                        className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 rounded-lg transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmDelete}
                                        disabled={actionLoading !== null}
                                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                                    >
                                        {actionLoading === articleToDelete.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AdminArticlesPage;
