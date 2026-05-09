import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAdmin } from '../context/AdminContext';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { 
    ArrowLeft, Save, Send, Star, Loader2, Tag, FileText, Layout, User, 
    Image as ImageIcon, Menu, LogOut, Users, Activity, ChevronLeftSquare, ChevronRightSquare 
} from 'lucide-react';
import { LuStethoscope } from 'react-icons/lu';
import ImageUpload from '../components/ImageUpload';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const AdminArticleEditorPage: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const { admin, loading: adminLoading, logout } = useAdmin();

    const isEditMode = !!id && id !== 'new';
    const quillRef = useRef<ReactQuill>(null);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Sidebar States
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        content: '',
        category: 'Depression',
        tags: [] as string[],
        author: '',
        image: '',
        featured: false,
        status: 'draft' as 'draft' | 'published'
    });
    const [tagInput, setTagInput] = useState('');

    const API_BASE_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:5001'
        : 'https://veraawell-backend.onrender.com';

    const categories = [
        'Addiction', 'Adult ADHD', 'Anger management', 'Anger & Frustration',
        'Anxiety disorders', 'Bipolar disorder', 'Confusion about identity',
        'Depression', 'Depressive disorders', 'Lack of Motivation',
        'Negative thinking', 'Relationship Struggles'
    ];

    useEffect(() => {
        if (adminLoading) return;

        if (!admin) {
            navigate('/admin-login');
            return;
        }
        if (admin.role !== 'super_admin') {
            navigate('/super-admin-dashboard');
            return;
        }

        if (!isEditMode && !formData.author) {
            setFormData(prev => ({
                ...prev,
                author: `${admin.firstName} ${admin.lastName}`.trim()
            }));
        }

        if (isEditMode) {
            fetchArticle();
        } else {
            setLoading(false);
        }
    }, [admin, adminLoading, id, isEditMode]);

    const fetchArticle = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('adminToken');
            const headers: HeadersInit = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(`${API_BASE_URL}/api/articles/admin/${id}`, {
                credentials: 'include',
                headers
            });

            if (response.ok) {
                const article = await response.json();
                setFormData({
                    title: article.title,
                    description: article.description,
                    content: article.content,
                    category: article.category,
                    tags: article.tags || [],
                    author: article.author,
                    image: article.image || '',
                    featured: article.featured,
                    status: article.status
                });
            } else {
                setError('Failed to fetch article details.');
            }
        } catch (error) {
            console.error('Error fetching article:', error);
            setError('An error occurred while loading the article.');
        } finally {
            setLoading(false);
        }
    };

    const handleImageUpload = async (file: File): Promise<string> => {
        const uploadFormData = new FormData();
        uploadFormData.append('image', file);

        const token = localStorage.getItem('adminToken');
        const response = await fetch(`${API_BASE_URL}/api/upload/article-image`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            credentials: 'include',
            body: uploadFormData
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Failed to upload image');
        return data.imageUrl;
    };

    const handleSubmit = async (publishNow = false) => {
        if (!formData.title || !formData.description || !formData.content) {
            toast.error('Please fill in title, description and content');
            return;
        }

        setSaving(true);
        try {
            const url = isEditMode
                ? `${API_BASE_URL}/api/articles/admin/${id}`
                : `${API_BASE_URL}/api/articles/admin`;

            const method = isEditMode ? 'PUT' : 'POST';
            const token = localStorage.getItem('adminToken');
            const headers: HeadersInit = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(url, {
                method,
                headers,
                credentials: 'include',
                body: JSON.stringify({
                    ...formData,
                    status: publishNow ? 'published' : formData.status
                })
            });

            if (response.ok) {
                toast.success(isEditMode ? 'Article updated successfully' : 'Article created successfully');
                if (!isEditMode) navigate('/super-admin-dashboard', { state: { tab: 'articles' } });
            } else {
                const data = await response.json();
                toast.error(data.message || 'Failed to save article');
            }
        } catch (error) {
            console.error('Error saving article:', error);
            toast.error('Failed to save article');
        } finally {
            setSaving(false);
        }
    };

    const handleAddTag = () => {
        if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
            setFormData(prev => ({
                ...prev,
                tags: [...prev.tags, tagInput.trim()]
            }));
            setTagInput('');
        }
    };

    const handleRemoveTag = (tag: string) => {
        setFormData(prev => ({
            ...prev,
            tags: prev.tags.filter(t => t !== tag)
        }));
    };

    const handleLogout = async () => {
        await logout();
        navigate('/admin-login');
    };

    const imageHandler = React.useCallback(() => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();

        input.onchange = async () => {
            const file = input.files ? input.files[0] : null;
            if (!file) return;

            const toastId = toast.loading('Uploading image...');
            try {
                const imageUrl = await handleImageUpload(file);
                const quill = (quillRef.current as any)?.getEditor();
                if (quill) {
                    const range = quill.getSelection(true);
                    quill.insertEmbed(range.index, 'image', imageUrl);
                }
                toast.success('Image inserted successfully', { id: toastId });
            } catch (error: any) {
                toast.error(error.message || 'Failed to upload image', { id: toastId });
            }
        };
    }, []);

    const quillModules = useMemo(() => ({
        toolbar: {
            container: [
                [{ 'header': [2, 3, 4, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                ['image', 'video', 'link', 'blockquote'],
                ['clean']
            ],
            handlers: { image: imageHandler }
        }
    }), [imageHandler]);

    if (adminLoading || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#fcfbfa]">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 text-[#0097b2] animate-spin mx-auto" />
                    <p className="mt-4 text-xs font-medium text-neutral-500">Loading editor...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#fcfbfa]">
                <div className="text-center p-8 bg-white rounded-2xl shadow-sm border border-neutral-100 max-w-md">
                    <div className="text-red-500 mb-4 text-3xl">⚠️</div>
                    <h3 className="text-sm font-semibold text-neutral-900 mb-1">Error Loading Article</h3>
                    <p className="text-xs text-neutral-500 mb-6">{error}</p>
                    <button
                        onClick={() => navigate('/super-admin-dashboard', { state: { tab: 'articles' } })}
                        className="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 text-xs font-semibold transition-colors"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

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
                            onClick={() => navigate('/super-admin-dashboard')}
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
                            onClick={() => navigate('/super-admin-dashboard', { state: { tab: 'articles' } })}
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
                <header className="h-14 bg-white border-b border-neutral-100 flex items-center justify-between px-6 sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden text-neutral-600">
                            <Menu size={18} />
                        </button>
                        <button
                            onClick={() => navigate('/super-admin-dashboard', { state: { tab: 'articles' } })}
                            className="p-1.5 hover:bg-neutral-50 rounded-lg transition-colors text-neutral-500 hover:text-neutral-900"
                        >
                            <ArrowLeft size={16} />
                        </button>
                        <h1 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
                            {isEditMode ? 'Edit Article' : 'Create Article'}
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${formData.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                {formData.status === 'published' ? 'Published' : 'Draft'}
                            </span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => handleSubmit(false)}
                            disabled={saving}
                            className="px-3 py-1.5 text-xs font-semibold text-neutral-700 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        >
                            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                            Save Draft
                        </button>
                        <button
                            onClick={() => handleSubmit(true)}
                            disabled={saving}
                            className="px-4 py-1.5 bg-[#0097b2] text-white rounded-lg hover:bg-[#007c93] text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                        >
                            {saving ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                            Publish
                        </button>
                    </div>
                </header>

                {/* Content */}
                <main className="flex-1 p-6 overflow-auto">
                    <div className="flex flex-col lg:flex-row gap-6">

                        {/* LEFT COLUMN: Main Content */}
                        <div className="flex-1 space-y-6">
                            {/* Title & Description Card */}
                            <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-6">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                                            Article Title
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.title}
                                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                            placeholder="Enter a catchy title..."
                                            className="w-full px-4 py-2.5 text-sm font-medium bg-neutral-50 rounded-lg border border-neutral-200 focus:outline-none focus:border-[#0097b2]"
                                            maxLength={200}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                                            Short Description
                                        </label>
                                        <textarea
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            placeholder="Write a brief summary for previews..."
                                            rows={3}
                                            className="w-full px-4 py-2.5 text-xs bg-neutral-50 rounded-lg border border-neutral-200 focus:outline-none focus:border-[#0097b2] resize-none"
                                            maxLength={500}
                                        />
                                        <div className="text-right mt-1 text-[10px] text-neutral-400 font-medium">
                                            {formData.description.length}/500
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Content Editor Card */}
                            <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-6 flex flex-col h-[500px]">
                                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <FileText size={14} />
                                    Main Content
                                </label>
                                <div className="flex-1 border border-neutral-200 rounded-lg overflow-hidden flex flex-col">
                                    <ReactQuill
                                        ref={quillRef}
                                        theme="snow"
                                        value={formData.content}
                                        onChange={(value) => setFormData({ ...formData, content: value })}
                                        modules={quillModules}
                                        className="h-full flex flex-col"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Sidebar Metadata */}
                        <div className="w-full lg:w-80 space-y-6">

                            {/* Publishing Options */}
                            <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-5">
                                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Layout size={14} />
                                    Publishing Options
                                </h3>
                                <div className="space-y-4">
                                    {/* Priority Section */}
                                    <div className="space-y-2">
                                        <p className="text-[11px] text-neutral-500 font-medium mb-2">
                                            High priority articles appear in the "Featured" section.
                                        </p>
                                        <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${formData.featured
                                            ? 'bg-amber-50 border-amber-200'
                                            : 'bg-neutral-50 border-neutral-200 hover:bg-neutral-100'
                                            }`}>
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${formData.featured ? 'bg-amber-500 border-amber-500' : 'border-neutral-300 bg-white'}`}>
                                                {formData.featured && <Star size={10} className="text-white fill-current" />}
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={formData.featured}
                                                onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                                                className="hidden"
                                            />
                                            <span className={`text-xs font-semibold ${formData.featured ? 'text-amber-800' : 'text-neutral-700'}`}>
                                                Featured Article
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Featured Image Card */}
                            <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-5">
                                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <ImageIcon size={14} />
                                    Featured Image
                                </h3>
                                <ImageUpload
                                    value={formData.image}
                                    onChange={(url) => setFormData({ ...formData, image: url })}
                                    onUpload={handleImageUpload}
                                />
                            </div>

                            {/* Organization Card */}
                            <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-5">
                                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Tag size={14} />
                                    Organization
                                </h3>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-neutral-400 mb-2 uppercase tracking-wider">
                                            Category
                                        </label>
                                        <select
                                            value={formData.category}
                                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                            className="w-full px-3 py-2 text-xs bg-neutral-50 rounded-lg border border-neutral-200 focus:outline-none focus:border-[#0097b2] appearance-none"
                                        >
                                            {categories.map(cat => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-bold text-neutral-400 mb-2 uppercase tracking-wider">
                                            Tags
                                        </label>
                                        <div className="flex flex-wrap gap-1.5 mb-3">
                                            {formData.tags.map(tag => (
                                                <span
                                                    key={tag}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-50 text-neutral-700 rounded-lg text-[10px] font-semibold border border-neutral-100"
                                                >
                                                    {tag}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveTag(tag)}
                                                        className="text-neutral-400 hover:text-red-500 transition-colors text-xs"
                                                    >
                                                        ×
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={tagInput}
                                                onChange={(e) => setTagInput(e.target.value)}
                                                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                                                placeholder="Add tag..."
                                                className="flex-1 px-3 py-1.5 text-xs bg-neutral-50 rounded-lg border border-neutral-200 focus:outline-none focus:border-[#0097b2]"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleAddTag}
                                                className="px-3 py-1.5 bg-neutral-50 text-neutral-600 rounded-lg hover:bg-neutral-100 text-xs font-semibold border border-neutral-200 transition-colors"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Author Card */}
                            <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-5">
                                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <User size={14} />
                                    Author
                                </h3>
                                <input
                                    type="text"
                                    value={formData.author}
                                    onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                                    placeholder="Author Name"
                                    className="w-full px-3 py-2 text-xs bg-neutral-50 rounded-lg border border-neutral-200 focus:outline-none focus:border-[#0097b2]"
                                />
                            </div>
                        </div>
                    </div>
                </main>
            </div>

            <style>{`
                .ql-container {
                    font-family: 'Inter', sans-serif;
                    font-size: 0.85rem;
                }
                .ql-editor {
                    min-height: 300px;
                }
                .ql-toolbar {
                    border-top: none !important;
                    border-left: none !important;
                    border-right: none !important;
                    border-bottom: 1px solid #e5e7eb !important;
                    background-color: #fcfbfa;
                }
                .ql-container.ql-snow {
                    border: none !important;
                }
            `}</style>
        </div>
    );
};

export default AdminArticleEditorPage;
