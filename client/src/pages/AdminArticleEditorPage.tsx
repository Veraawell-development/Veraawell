import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAdmin } from '../context/AdminContext';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import {
    ArrowLeft, Save, Send, Star, Loader2, Tag, FileText, Layout, User,
    Image as ImageIcon, Menu, LogOut, Activity, ChevronLeftSquare, ChevronRightSquare, X, EyeOff, RotateCcw
} from 'lucide-react';
import ImageUpload from '../components/ImageUpload';
import toast from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminFetch, adminQueryRetry, errorMessage } from '../utils/adminApi';
import { ARTICLE_CATEGORIES } from '../data/articleCategories';

type ArticleStatus = 'draft' | 'published' | 'archived';

interface ArticleForm {
    title: string;
    description: string;
    content: string;
    category: string;
    tags: string[];
    author: string;
    image: string;
    featured: boolean;
}

interface LoadedArticle extends ArticleForm {
    _id: string;
    status: ArticleStatus;
}

/** Quill's empty document is `<p><br></p>`, which is not content. */
const hasText = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0;

const STATUS_BADGE: Record<ArticleStatus, { label: string; className: string }> = {
    published: { label: 'Published', className: 'bg-emerald-50 text-emerald-700' },
    draft: { label: 'Draft', className: 'bg-amber-50 text-amber-700' },
    archived: { label: 'Archived', className: 'bg-neutral-100 text-neutral-600' },
};

const AdminArticleEditorPage: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const { admin, logout } = useAdmin();
    const queryClient = useQueryClient();

    const isEditMode = !!id && id !== 'new';
    const quillRef = useRef<ReactQuill>(null);

    // Sidebar States
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    const [formData, setFormData] = useState<ArticleForm>({
        title: '',
        description: '',
        content: '',
        category: 'Depression',
        tags: [],
        author: '',
        image: '',
        featured: false,
    });
    // What the server holds — not what the buttons will save. Saving always
    // names its status explicitly, so editing a live article and pressing
    // "save" can never publish (or unpublish) by accident.
    const [savedStatus, setSavedStatus] = useState<ArticleStatus | null>(isEditMode ? null : 'draft');
    const [tagInput, setTagInput] = useState('');

    useEffect(() => {
        if (!isEditMode && admin) {
            setFormData(prev => prev.author ? prev : { ...prev, author: `${admin.firstName} ${admin.lastName}`.trim() });
        }
    }, [admin, isEditMode]);

    const articleQuery = useQuery({
        queryKey: ['admin', 'article', id],
        queryFn: () => adminFetch<LoadedArticle>(`/articles/admin/${id}`),
        enabled: isEditMode,
        retry: adminQueryRetry,
        // A background refetch must never overwrite what is being typed.
        refetchOnWindowFocus: false,
        staleTime: Infinity,
    });

    // Fill the form once per article, and only then mount the editor: Quill
    // that mounts empty and is handed the article a render later (under
    // StrictMode's mount/unmount/mount) comes up blank, and saving from there
    // would overwrite the article with nothing.
    const loadedId = useRef<string | null>(null);
    const [formReady, setFormReady] = useState(!isEditMode);
    useEffect(() => {
        const article = articleQuery.data;
        if (!article || loadedId.current === article._id) return;
        loadedId.current = article._id;
        setFormData({
            title: article.title || '',
            description: article.description || '',
            content: article.content || '',
            category: article.category || 'Depression',
            tags: article.tags || [],
            author: article.author || '',
            image: article.image || '',
            featured: !!article.featured,
        });
        setSavedStatus(article.status);
        setFormReady(true);
    }, [articleQuery.data]);

    const handleImageUpload = async (file: File): Promise<string> => {
        const uploadFormData = new FormData();
        uploadFormData.append('image', file);
        const data = await adminFetch<{ imageUrl: string }>('/upload/article-image', { method: 'POST', body: uploadFormData });
        return data.imageUrl;
    };

    const saveArticleMutation = useMutation({
        mutationFn: (status: 'draft' | 'published') =>
            adminFetch<{ article?: { _id: string; status: ArticleStatus } }>(
                isEditMode ? `/articles/admin/${id}` : '/articles/admin',
                { method: isEditMode ? 'PUT' : 'POST', body: { ...formData, status } }
            ),
        onSuccess: (data, status) => {
            const before = savedStatus;
            const after = data?.article?.status ?? status;
            queryClient.invalidateQueries({ queryKey: ['admin', 'articles'] });
            if (isEditMode) queryClient.invalidateQueries({ queryKey: ['admin', 'article', id] });

            let message: string;
            if (after === 'published') message = before === 'published' ? 'Article updated' : 'Article published';
            else if (before === 'published') message = 'Unpublished — saved as a draft';
            else if (before === 'archived') message = 'Restored as a draft';
            else message = isEditMode ? 'Draft saved' : 'Saved as a draft';
            toast.success(message);

            setSavedStatus(after);
            if (!isEditMode) navigate('/super-admin-dashboard', { state: { tab: 'articles' } });
        },
        onError: (err) => toast.error(errorMessage(err, 'Failed to save article')),
    });

    const handleSubmit = (status: 'draft' | 'published') => {
        if (!formData.title.trim() || !formData.description.trim() || !hasText(formData.content) || !formData.author.trim()) {
            toast.error('Please fill in the title, description, content and author');
            return;
        }
        saveArticleMutation.mutate(status);
    };

    const saving = saveArticleMutation.isPending;

    const handleAddTag = () => {
        const tag = tagInput.trim();
        if (tag) {
            setFormData(prev => prev.tags.includes(tag) ? prev : { ...prev, tags: [...prev.tags, tag] });
            setTagInput('');
        }
    };

    const handleRemoveTag = (tag: string) => {
        setFormData(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
    };

    const handleLogout = async () => {
        await logout();
        navigate('/admin-login', { replace: true });
    };

    const goTo = (state?: { tab: string }) => {
        setSidebarOpen(false);
        navigate('/super-admin-dashboard', state ? { state } : undefined);
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
                // getEditor exists at runtime; the local type stub omits it.
                const quill = (quillRef.current as unknown as {
                    getEditor?: () => { getSelection: (focus: boolean) => { index: number }; insertEmbed: (index: number, type: string, value: string) => void };
                } | null)?.getEditor?.();
                if (quill) {
                    const range = quill.getSelection(true);
                    quill.insertEmbed(range.index, 'image', imageUrl);
                }
                toast.success('Image inserted successfully', { id: toastId });
            } catch (error) {
                toast.error(errorMessage(error, 'Failed to upload image'), { id: toastId });
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

    if (isEditMode && !formReady && !articleQuery.isError) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#fcfbfa]">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 text-[#0097b2] animate-spin mx-auto" />
                    <p className="mt-4 text-xs font-medium text-neutral-500">Loading editor...</p>
                </div>
            </div>
        );
    }

    if (isEditMode && articleQuery.isError) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#fcfbfa] px-4">
                <div className="text-center p-8 bg-white rounded-2xl shadow-sm border border-neutral-100 max-w-md">
                    <h3 className="text-sm font-semibold text-neutral-900 mb-1">Couldn't load this article</h3>
                    <p className="text-xs text-neutral-500 mb-6">{errorMessage(articleQuery.error)}</p>
                    <div className="flex justify-center gap-2">
                        <button
                            onClick={() => { void articleQuery.refetch(); }}
                            className="px-4 py-2 bg-[#0097b2] text-white rounded-lg hover:bg-[#007c93] text-xs font-semibold transition-colors"
                        >
                            Retry
                        </button>
                        <button
                            onClick={() => navigate('/super-admin-dashboard', { state: { tab: 'articles' } })}
                            className="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 text-xs font-semibold transition-colors"
                        >
                            Go Back
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const badge = STATUS_BADGE[savedStatus ?? 'draft'];
    const isLive = savedStatus === 'published';
    const isArchived = savedStatus === 'archived';

    return (
        <div className="min-h-screen flex bg-[#fcfbfa] text-neutral-800 antialiased font-sans">

            {sidebarOpen && (
                <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
            )}

            {/* ── Sidebar (Consistent with Dashboard) ─────────────────────── */}
            <div
                className={`fixed inset-y-0 left-0 z-50 bg-[#001e24] text-[#fff3db] transform transition-all duration-300 ease-in-out md:translate-x-0 w-60
                  ${sidebarCollapsed ? 'md:w-16' : 'md:w-60'}
                  ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
                <div className="flex flex-col h-full p-4">
                    <div className={`mb-8 pt-2 flex items-center justify-between ${sidebarCollapsed ? 'md:justify-center' : ''}`}>
                        <div className={sidebarCollapsed ? 'md:hidden' : ''}>
                            <h1 className="text-sm font-semibold tracking-wider uppercase text-[#0097b2]">Veraawell</h1>
                            <p className="text-[10px] text-[#fff3db] opacity-60 mt-0.5">Control Panel</p>
                        </div>
                        <button
                            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            className="hidden md:flex items-center justify-center w-6 h-6 rounded-full bg-[#fff3db]/5 hover:bg-[#fff3db]/10 text-[#fff3db]/70 transition-colors"
                        >
                            {sidebarCollapsed ? <ChevronRightSquare size={14} /> : <ChevronLeftSquare size={14} />}
                        </button>
                        <button
                            onClick={() => setSidebarOpen(false)}
                            aria-label="Close menu"
                            className="md:hidden flex items-center justify-center w-7 h-7 rounded-full bg-[#fff3db]/5 text-[#fff3db]/70"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    <nav className="flex-1 space-y-1">
                        <button
                            onClick={() => goTo({ tab: 'analytics' })}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-[#fff3db]/70 hover:bg-[#fff3db]/5 hover:text-[#fff3db] transition-colors ${sidebarCollapsed ? 'md:justify-center' : ''}`}
                            title={sidebarCollapsed ? "Dashboard" : ""}
                        >
                            <Activity size={16} />
                            <span className={sidebarCollapsed ? 'md:hidden' : ''}>Dashboard</span>
                        </button>
                        <button
                            onClick={() => goTo({ tab: 'articles' })}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium bg-[#0097b2] text-white transition-colors ${sidebarCollapsed ? 'md:justify-center' : ''}`}
                            title={sidebarCollapsed ? "Articles" : ""}
                        >
                            <FileText size={16} />
                            <span className={sidebarCollapsed ? 'md:hidden' : ''}>Articles</span>
                        </button>
                    </nav>

                    <div className="border-t border-[#fff3db]/10 pt-4 mt-auto">
                        <div className={`flex items-center gap-3 px-2 mb-3 ${sidebarCollapsed ? 'md:hidden' : ''}`}>
                            <div className="w-8 h-8 rounded-full bg-[#0097b2] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                {admin?.firstName?.[0] || 'A'}
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-xs font-medium truncate">{admin?.firstName} {admin?.lastName}</p>
                                <p className="text-[10px] text-[#fff3db]/50 truncate">{admin?.role === 'super_admin' ? 'Super Admin' : 'Admin'}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => { void handleLogout(); }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors ${sidebarCollapsed ? 'md:justify-center' : ''}`}
                            title={sidebarCollapsed ? "Logout" : ""}
                        >
                            <LogOut size={16} />
                            <span className={sidebarCollapsed ? 'md:hidden' : ''}>Logout</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Main Content ────────────────────────────────────────────────── */}
            <div className={`flex-1 min-w-0 flex flex-col transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'md:pl-16' : 'md:pl-60'}`}>

                <header className="min-h-14 bg-white border-b border-neutral-100 flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-2 sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="md:hidden text-neutral-600">
                            <Menu size={18} />
                        </button>
                        <button
                            onClick={() => navigate('/super-admin-dashboard', { state: { tab: 'articles' } })}
                            aria-label="Back to articles"
                            className="p-1.5 hover:bg-neutral-50 rounded-lg transition-colors text-neutral-500 hover:text-neutral-900"
                        >
                            <ArrowLeft size={16} />
                        </button>
                        <h1 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
                            {isEditMode ? 'Edit Article' : 'Create Article'}
                            <span data-testid="article-status" className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${badge.className}`}>
                                {badge.label}
                            </span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        {/* The secondary action always saves a draft, and says
                            so in full when that takes a live article down. */}
                        <button
                            onClick={() => handleSubmit('draft')}
                            disabled={saving}
                            className="px-4 py-2 text-xs font-bold text-neutral-600 bg-white border-2 border-neutral-200 rounded-xl hover:bg-neutral-50 hover:border-neutral-300 transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                        >
                            {saving && saveArticleMutation.variables === 'draft'
                                ? <Loader2 size={14} className="animate-spin" />
                                : isLive ? <EyeOff size={14} /> : isArchived ? <RotateCcw size={14} /> : <Save size={14} />}
                            {isLive ? 'Unpublish & save as draft' : isArchived ? 'Restore as draft' : 'Save as draft'}
                        </button>
                        <button
                            onClick={() => handleSubmit('published')}
                            disabled={saving}
                            className="px-5 py-2 bg-gradient-to-r from-[#0097b2] to-[#007c93] hover:from-[#007c93] hover:to-[#005f73] text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-[#0097b2]/20"
                        >
                            {saving && saveArticleMutation.variables === 'published' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                            {isLive ? 'Update' : 'Publish'}
                        </button>
                    </div>
                </header>

                <main className="flex-1 p-4 md:p-6 overflow-auto">
                    {isLive && (
                        <p className="mb-4 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2">
                            This article is live. <span className="font-semibold">Update</span> publishes your edits straight away;
                            <span className="font-semibold"> Unpublish &amp; save as draft</span> takes it off the site.
                        </p>
                    )}
                    {isArchived && (
                        <p className="mb-4 text-[11px] text-neutral-700 bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-2">
                            This article is archived and not on the site. Restore it as a draft, or publish it again.
                        </p>
                    )}
                    <div className="flex flex-col lg:flex-row gap-6">

                        {/* LEFT COLUMN: Main Content */}
                        <div className="flex-1 min-w-0 space-y-6">
                            <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-6">
                                <div className="space-y-4">
                                    <div>
                                        <label htmlFor="article-title" className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                                            Article Title
                                        </label>
                                        <input
                                            id="article-title"
                                            type="text"
                                            value={formData.title}
                                            onChange={(e) => { const v = e.target.value; setFormData(prev => ({ ...prev, title: v })); }}
                                            placeholder="Enter a catchy title..."
                                            className="w-full px-4 py-3 text-sm font-medium bg-white rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] transition-all shadow-sm"
                                            maxLength={200}
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="article-description" className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                                            Short Description
                                        </label>
                                        <textarea
                                            id="article-description"
                                            value={formData.description}
                                            onChange={(e) => { const v = e.target.value; setFormData(prev => ({ ...prev, description: v })); }}
                                            placeholder="Write a brief summary for previews..."
                                            rows={3}
                                            className="w-full px-4 py-3 text-xs bg-white rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] resize-none transition-all shadow-sm"
                                            maxLength={500}
                                        />
                                        <div className="text-right mt-1 text-[10px] text-neutral-400 font-medium">
                                            {formData.description.length}/500
                                        </div>
                                    </div>
                                </div>
                            </div>

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
                                        onChange={(value) => setFormData(prev => ({ ...prev, content: value }))}
                                        modules={quillModules}
                                        className="h-full flex flex-col"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Sidebar Metadata */}
                        <div className="w-full lg:w-80 space-y-6">
                            <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-5">
                                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Layout size={14} />
                                    Publishing Options
                                </h3>
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
                                            onChange={(e) => { const v = e.target.checked; setFormData(prev => ({ ...prev, featured: v })); }}
                                            className="hidden"
                                        />
                                        <span className={`text-xs font-semibold ${formData.featured ? 'text-amber-800' : 'text-neutral-700'}`}>
                                            Featured Article
                                        </span>
                                    </label>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-5">
                                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <ImageIcon size={14} />
                                    Featured Image
                                </h3>
                                {/* Functional update: the upload resolves after a
                                    delay, and a `{ ...formData }` captured when it
                                    started would wipe whatever was typed meanwhile. */}
                                <ImageUpload
                                    value={formData.image}
                                    onChange={(url) => setFormData(prev => ({ ...prev, image: url }))}
                                    onUpload={handleImageUpload}
                                />
                            </div>

                            <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-5">
                                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Tag size={14} />
                                    Organization
                                </h3>

                                <div className="space-y-4">
                                    <div>
                                        <label htmlFor="article-category" className="block text-[10px] font-bold text-neutral-400 mb-2 uppercase tracking-wider">
                                            Category
                                        </label>
                                        <select
                                            id="article-category"
                                            value={formData.category}
                                            onChange={(e) => { const v = e.target.value; setFormData(prev => ({ ...prev, category: v })); }}
                                            className="w-full px-4 py-2.5 text-xs bg-white rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] appearance-none transition-all shadow-sm"
                                        >
                                            {ARTICLE_CATEGORIES.map(cat => (
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
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#0097b2]/10 text-[#0097b2] rounded-lg text-[10px] font-bold border border-[#0097b2]/20 shadow-sm"
                                                >
                                                    {tag}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveTag(tag)}
                                                        aria-label={`Remove tag ${tag}`}
                                                        className="text-[#0097b2]/60 hover:text-red-500 transition-colors text-xs ml-1"
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
                                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                                                placeholder="Add tag..."
                                                className="flex-1 min-w-0 px-4 py-2 text-xs bg-white rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] transition-all shadow-sm"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleAddTag}
                                                className="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-xl hover:bg-neutral-200 text-xs font-bold transition-colors shadow-sm"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-5">
                                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <User size={14} />
                                    Author
                                </h3>
                                <input
                                    type="text"
                                    aria-label="Author"
                                    value={formData.author}
                                    onChange={(e) => { const v = e.target.value; setFormData(prev => ({ ...prev, author: v })); }}
                                    placeholder="Author Name"
                                    className="w-full px-4 py-2.5 text-xs bg-white rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#0097b2]/20 focus:border-[#0097b2] transition-all shadow-sm"
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
