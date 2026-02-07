import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAdmin } from '../context/AdminContext';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { ArrowLeft, Save, Send, Star, Loader2, Tag, FileText, Layout, User, Image as ImageIcon } from 'lucide-react';
import ImageUpload from '../components/ImageUpload';

const AdminArticleEditorPage: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const { admin, loading: adminLoading } = useAdmin();

    const isEditMode = !!id && id !== 'new';
    const quillRef = useRef<ReactQuill>(null);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

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
            headers: {
                'Authorization': `Bearer ${token}`
            },
            credentials: 'include',
            body: uploadFormData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to upload image');
        }

        return data.imageUrl;
    };

    const handleSubmit = async (publishNow = false) => {
        if (!formData.title || !formData.description || !formData.content) {
            alert('Please fill in title, description and content');
            return;
        }

        setSaving(true);

        try {
            const url = isEditMode
                ? `${API_BASE_URL}/api/articles/admin/${id}`
                : `${API_BASE_URL}/api/articles/admin`;

            const method = isEditMode ? 'PUT' : 'POST';

            const token = localStorage.getItem('adminToken');
            const headers: HeadersInit = {
                'Content-Type': 'application/json'
            };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

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
                const data = await response.json();

                // Update local state with returned article data (handles sanitization, slug updates, etc.)
                if (data.article) {
                    setFormData(prev => ({
                        ...prev,
                        title: data.article.title,
                        description: data.article.description,
                        content: data.article.content,
                        category: data.article.category,
                        tags: data.article.tags || [],
                        author: data.article.author,
                        image: data.article.image || '',
                        featured: data.article.featured,
                        status: data.article.status
                    }));
                }

                alert(isEditMode ? 'Article updated successfully' : 'Article created successfully');
                if (!isEditMode) navigate('/admin/articles');
            } else {
                const data = await response.json();
                alert(data.message || 'Failed to save article');
            }
        } catch (error) {
            console.error('Error saving article:', error);
            alert('Failed to save article');
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

    const quillModules = useMemo(() => ({
        toolbar: [
            [{ 'header': [2, 3, 4, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ 'list': 'ordered' }, { 'list': 'bullet' }],
            ['link', 'blockquote'],
            ['clean']
        ]
    }), []);

    if (adminLoading || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 text-teal-600 animate-spin mx-auto" />
                    <p className="mt-4 text-gray-600 font-medium">Loading editor...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center p-8 bg-white rounded-xl shadow-sm border border-gray-200 max-w-md">
                    <div className="text-red-500 mb-4 text-4xl">⚠️</div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Error Loading Article</h3>
                    <p className="text-gray-600 mb-6">{error}</p>
                    <button
                        onClick={() => navigate('/admin/articles')}
                        className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Top Navigation Bar */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-20 px-6 py-4 shadow-sm">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate('/admin/articles')}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-900"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                {isEditMode ? 'Edit Article' : 'New Article'}
                                <span className={`px-2 py-0.5 text-xs rounded-full ${formData.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                    {formData.status === 'published' ? 'Published' : 'Draft'}
                                </span>
                            </h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => handleSubmit(false)}
                            disabled={saving}
                            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {formData.status === 'published' ? 'Save Changes' : 'Save Draft'}
                        </button>
                        <button
                            onClick={() => handleSubmit(true)}
                            disabled={saving}
                            className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium transition-all disabled:opacity-50 flex items-center gap-2 shadow-md hover:shadow-lg"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            Publish
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-8">
                <div className="flex flex-col lg:flex-row gap-8">

                    {/* LEFT COLUMN: Main Content */}
                    <div className="flex-1 space-y-6">
                        {/* Title & Description Card */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        Article Title
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.title}
                                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                        placeholder="Enter a catchy title..."
                                        className="w-full px-4 py-3 text-lg font-medium rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder-gray-400"
                                        maxLength={200}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        Short Description
                                    </label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="Write a brief summary for SEO and card previews..."
                                        rows={3}
                                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                                        maxLength={500}
                                    />
                                    <div className="text-right mt-1 text-xs text-gray-400">
                                        {formData.description.length}/500
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Content Editor Card */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col h-[600px]">
                            <label className="block text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                                <FileText className="w-4 h-4" />
                                Main Content
                            </label>
                            <div className="flex-1 border border-gray-200 rounded-lg overflow-hidden flex flex-col">
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

                        {/* Publishing & Priority Card */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                <Layout className="w-4 h-4 text-gray-500" />
                                Publishing Options
                            </h3>
                            <div className="space-y-5">
                                {/* Status Section */}
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                        Visibility & Status
                                    </label>
                                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${formData.status === 'published' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                                            <span className="text-sm font-medium text-gray-700 capitalize">{formData.status}</span>
                                        </div>
                                        <span className="text-xs text-gray-400">
                                            {formData.status === 'published' ? 'Visible to public' : 'Only admins'}
                                        </span>
                                    </div>
                                </div>

                                <hr className="border-gray-100" />

                                {/* Priority Section */}
                                <div className="space-y-3">
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
                                        Priority Level
                                    </label>
                                    <p className="text-xs text-gray-400 mb-2">
                                        High priority articles appear in the "Featured" section and carousel.
                                    </p>
                                    <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${formData.featured
                                        ? 'bg-yellow-50 border-yellow-200 ring-1 ring-yellow-200'
                                        : 'bg-white border-gray-200 hover:bg-gray-50'
                                        }`}>
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${formData.featured ? 'bg-yellow-500 border-yellow-500' : 'border-gray-300 bg-white'
                                            }`}>
                                            {formData.featured && <Star className="w-3 h-3 text-white fill-current" />}
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={formData.featured}
                                            onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                                            className="hidden"
                                        />
                                        <div className="flex flex-col">
                                            <span className={`text-sm font-medium ${formData.featured ? 'text-yellow-800' : 'text-gray-700'}`}>
                                                Featured Article
                                            </span>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* Featured Image Card */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                <ImageIcon className="w-4 h-4 text-gray-500" />
                                Featured Image
                            </h3>
                            <ImageUpload
                                value={formData.image}
                                onChange={(url) => setFormData({ ...formData, image: url })}
                                onUpload={handleImageUpload}
                            />
                        </div>

                        {/* Organization Card */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                <Tag className="w-4 h-4 text-gray-500" />
                                Organization
                            </h3>

                            <div className="space-y-5">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">
                                        Category
                                    </label>
                                    <select
                                        value={formData.category}
                                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                                    >
                                        {categories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">
                                        Tags
                                    </label>
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {formData.tags.map(tag => (
                                            <span
                                                key={tag}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-medium border border-gray-200"
                                            >
                                                {tag}
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveTag(tag)}
                                                    className="text-gray-400 hover:text-red-500 transition-colors"
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
                                            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleAddTag}
                                            className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors"
                                        >
                                            Add
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Author Card */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                <User className="w-4 h-4 text-gray-500" />
                                Author
                            </h3>
                            <input
                                type="text"
                                value={formData.author}
                                onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                                placeholder="Author Name"
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                .ql-container {
                    font-family: 'Inter', sans-serif;
                    font-size: 1rem;
                }
                .ql-editor {
                    min-height: 400px;
                }
                .ql-toolbar {
                    border-top: none !important;
                    border-left: none !important;
                    border-right: none !important;
                    border-bottom: 1px solid #e5e7eb !important;
                    background-color: #f9fafb;
                }
                .ql-container.ql-snow {
                    border: none !important;
                }
            `}</style>
        </div>
    );
};

export default AdminArticleEditorPage;
