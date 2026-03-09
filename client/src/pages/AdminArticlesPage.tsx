import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdmin } from '../context/AdminContext';
import {
    FileText, Plus, Edit, Trash2, Star, Eye, Search,
    Filter, Loader2, AlertCircle, CheckCircle, Clock, ChevronLeft, ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';

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
    const { admin } = useAdmin();
    const [articles, setArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);

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

    const API_BASE_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:5001'
        : 'https://veraawell-backend.onrender.com';

    const categories = [
        'All',
        'Addiction',
        'Adult ADHD',
        'Anger management',
        'Anger & Frustration',
        'Anxiety disorders',
        'Bipolar disorder',
        'Confusion about identity',
        'Depression',
        'Depressive disorders',
        'Lack of Motivation',
        'Negative thinking',
        'Relationship Struggles'
    ];

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery);
            setPage(1); // Reset to page 1 on search change
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Reset page when filters change
    useEffect(() => {
        setPage(1);
    }, [selectedCategory, selectedStatus]);

    useEffect(() => {
        if (!admin) {
            navigate('/admin-login');
            return;
        }
        if (admin.role !== 'super_admin') {
            navigate('/super-admin-dashboard');
            return;
        }

        fetchArticles();
    }, [admin, debouncedSearch, selectedCategory, selectedStatus, page]);

    const fetchArticles = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('adminToken');
            const headers: HeadersInit = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const params = new URLSearchParams({
                page: page.toString(),
                limit: '10',
                search: debouncedSearch,
                category: selectedCategory,
                status: selectedStatus
            });

            const response = await fetch(`${API_BASE_URL}/api/articles/admin/all?${params}`, {
                credentials: 'include',
                headers
            });

            if (response.ok) {
                const data = await response.json();
                // Handle both old array format (fallback) and new paginated format
                if (Array.isArray(data)) {
                    setArticles(data);
                    setPagination(null);
                } else {
                    setArticles(data.articles);
                    setPagination(data.pagination);
                }
            } else {
                console.error('Failed to fetch articles');
            }
        } catch (error) {
            console.error('Error fetching articles:', error);
        } finally {
            setLoading(false);
        }
    };

    const requestDelete = (id: string, title: string) => {
        setArticleToDelete({ id, title });
    };

    const confirmDelete = async () => {
        if (!articleToDelete) return;
        const { id } = articleToDelete;
        setActionLoading(id);

        try {
            const token = localStorage.getItem('adminToken');
            const headers: HeadersInit = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(`${API_BASE_URL}/api/articles/admin/${id}`, {
                method: 'DELETE',
                credentials: 'include',
                headers
            });

            if (response.ok) {
                setArticles(articles.filter(a => a._id !== id));
                // Optional: refresh if getting low on items to fill page
                if (articles.length === 1 && page > 1) {
                    setPage(page - 1);
                } else if (articles.length <= 1) {
                    fetchArticles();
                }
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
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(`${API_BASE_URL}/api/articles/admin/${id}/feature`, {
                method: 'POST',
                credentials: 'include',
                headers
            });

            if (response.ok) {
                fetchArticles();
                toast.success('Featured status updated');
            } else {
                toast.error('Failed to update featured status');
            }
        } catch (error) {
            console.error('Error toggling featured:', error);
            toast.error('An error occurred');
        } finally {
            setActionLoading(null);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'published':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-green-50 text-green-700 rounded-full text-xs font-medium border border-green-200">
                        <CheckCircle className="w-3 h-3" />
                        Published
                    </span>
                );
            case 'draft':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-yellow-50 text-yellow-700 rounded-full text-xs font-medium border border-yellow-200">
                        <Clock className="w-3 h-3" />
                        Draft
                    </span>
                );
            case 'archived':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs font-medium border border-gray-200">
                        <AlertCircle className="w-3 h-3" />
                        Archived
                    </span>
                );
            default:
                return null;
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2" style={{ fontFamily: 'Bree Serif, serif' }}>
                                <FileText className="w-6 h-6 text-teal-600" />
                                Articles
                            </h1>
                            <p className="text-sm text-gray-500 mt-0.5">
                                Manage, edit, and publish your content
                            </p>
                        </div>
                        <button
                            onClick={() => navigate('/admin/articles/new')}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium transition-colors shadow-sm"
                        >
                            <Plus className="w-4 h-4" />
                            New Article
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Filters */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {/* Search */}
                        <div className="md:col-span-2 relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search by title..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                            />
                        </div>

                        {/* Category Filter */}
                        <div className="relative">
                            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <select
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                className="w-full pl-9 pr-8 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent appearance-none text-sm bg-white"
                            >
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>

                        {/* Status Filter */}
                        <div className="relative">
                            <select
                                value={selectedStatus}
                                onChange={(e) => setSelectedStatus(e.target.value)}
                                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent appearance-none text-sm bg-white"
                            >
                                <option value="All">All Status</option>
                                <option value="published">Published</option>
                                <option value="draft">Draft</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    {loading ? (
                        <div className="p-12 text-center">
                            <Loader2 className="w-8 h-8 text-teal-600 animate-spin mx-auto mb-2" />
                            <p className="text-gray-500 text-sm">Loading articles...</p>
                        </div>
                    ) : articles.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <FileText className="w-8 h-8 text-gray-300" />
                            </div>
                            <h3 className="text-lg font-medium text-gray-900 mb-1">No articles found</h3>
                            <p className="text-gray-500 text-sm mb-4">
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
                                    className="text-teal-600 font-medium hover:text-teal-700 text-sm"
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
                                        <tr className="bg-gray-50 border-b border-gray-200">
                                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-1/2">Article</th>
                                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Stats</th>
                                            <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {articles.map((article) => (
                                            <tr key={article._id} className="hover:bg-gray-50 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-gray-900 mb-1 line-clamp-1 group-hover:text-teal-600 transition-colors">
                                                            {article.title}
                                                        </span>
                                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                                            <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600">
                                                                {article.category}
                                                            </span>
                                                            <span>•</span>
                                                            <span>{new Date(article.createdAt).toLocaleDateString()}</span>
                                                            <span>•</span>
                                                            <span>{article.author}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {getStatusBadge(article.status)}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-500">
                                                    <div className="flex items-center gap-3">
                                                        <span className="flex items-center gap-1" title="Views">
                                                            <Eye className="w-4 h-4 text-gray-400" />
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
                                                            className={`p-1.5 rounded-md hover:bg-gray-100 transition-colors ${article.featured ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'} disabled:opacity-50`}
                                                            title={article.featured ? "Unfeature" : "Feature"}
                                                        >
                                                            {actionLoading === article._id + '-feature' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className={`w-4 h-4 ${article.featured ? 'fill-current' : ''}`} />}
                                                        </button>
                                                        <button
                                                            onClick={() => navigate(`/admin/articles/edit/${article._id}`)}
                                                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50"
                                                            title="Edit"
                                                            disabled={actionLoading !== null}
                                                        >
                                                            <Edit className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => requestDelete(article._id, article.title)}
                                                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                                                            title="Delete"
                                                            disabled={actionLoading !== null}
                                                        >
                                                            {actionLoading === article._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
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
                                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                                    <div className="text-sm text-gray-500">
                                        Showing <span className="font-medium">{((page - 1) * pagination.limit) + 1}</span> to <span className="font-medium">{Math.min(page * pagination.limit, pagination.total)}</span> of <span className="font-medium">{pagination.total}</span> results
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                            disabled={page === 1}
                                            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <ChevronLeft className="w-4 h-4 text-gray-600" />
                                        </button>
                                        <button
                                            onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                                            disabled={page === pagination.pages}
                                            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <ChevronRight className="w-4 h-4 text-gray-600" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {articleToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6">
                            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                                <AlertCircle className="w-6 h-6 text-red-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Article</h3>
                            <p className="text-gray-500 mb-6">
                                Are you sure you want to delete <span className="font-semibold text-gray-900">"{articleToDelete.title}"</span>? This action cannot be undone.
                            </p>
                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => setArticleToDelete(null)}
                                    disabled={actionLoading !== null}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    disabled={actionLoading !== null}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium flex items-center gap-2"
                                >
                                    {actionLoading === articleToDelete.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminArticlesPage;
