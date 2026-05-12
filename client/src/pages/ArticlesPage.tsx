import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataSocket } from '../hooks/useDataSocket';
import toast from 'react-hot-toast';
import BackToDashboard from '../components/BackToDashboard';
import { Search, ArrowRight, Clock, Home } from 'lucide-react';
import { API_BASE_URL } from '../config/api';

interface Article {
    _id: string;
    slug: string;
    title: string;
    description: string;
    category: string;
    tags: string[];
    readTime: string;
    image: string;
    author: string;
    publishedDate: string;
    featured?: boolean;
}

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

const ArticlesPage: React.FC = () => {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [articles, setArticles] = useState<Article[]>([]);

    // REAL-TIME: Connect to data socket
    const { socket } = useDataSocket();

    useEffect(() => {
        fetchArticles();
    }, [searchQuery, selectedCategory]);

    // ✨ REAL-TIME: Listen for article events
    useEffect(() => {
        if (!socket) return;

        socket.on('article:new', ({ article }) => {
            console.log('[REAL-TIME] New article published:', article);
            toast.success(`New article: ${article.title}`);
            fetchArticles(); // Refresh articles list
        });

        socket.on('article:deleted', ({ articleId }) => {
            console.log('[REAL-TIME] Article deleted:', articleId);
            toast('An article was removed', { icon: 'ℹ️' });
            setArticles(prev => prev.filter(a => a._id !== articleId));
        });

        return () => {
            socket.off('article:new');
            socket.off('article:deleted');
        };
    }, [socket]);

    const fetchArticles = async () => {
        try {
            const params = new URLSearchParams({
                search: searchQuery,
                category: selectedCategory,
                limit: '100'
            });

            const response = await fetch(`${API_BASE_URL}/articles?${params}`);
            if (response.ok) {
                const data = await response.json();
                setArticles(data.articles);
            }
        } catch (error) {
            console.error('Error fetching articles:', error);
        }
    };

    const featuredArticle = articles.find(a => a.featured);
    const otherFeatured = articles.filter(a => !a.featured).slice(0, 2);
    const filteredArticles = articles;

    return (
        <div className="min-h-screen bg-[#fcfbfa]">
            {/* Breadcrumb */}
            <div className="bg-white border-b border-neutral-100">
                <div className="max-w-7xl mx-auto px-4 py-4">
                    <div className="flex items-center text-xs font-medium text-neutral-500">
                        <button onClick={() => navigate('/')} className="hover:text-[#0097b2] transition-colors flex items-center gap-1">
                            <Home size={12} />
                            Home
                        </button>
                        <span className="mx-2 text-neutral-300">/</span>
                        <button onClick={() => navigate('/resources')} className="hover:text-[#0097b2] transition-colors">
                            Resources
                        </button>
                        <span className="mx-2 text-neutral-300">/</span>
                        <span className="text-neutral-900">Articles</span>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 py-12 flex flex-col xl:flex-row gap-8">
                
                {/* Main Content Area */}
                <div className="flex-1">
                    <BackToDashboard className="mb-8" />
                    
                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-12">
                        <div>
                            <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-2 font-serif" style={{ fontFamily: 'Bree Serif, serif' }}>
                                Wellness Articles
                            </h1>
                            <p className="text-xs text-neutral-500 font-medium">
                                Take control of your mental health with clinically vetted blogs and articles.
                            </p>
                        </div>
                        <div className="relative w-full md:w-80">
                            <input
                                type="text"
                                placeholder="Search articles..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full px-4 py-2.5 pl-10 text-xs rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#0097b2] focus:border-transparent font-medium"
                            />
                            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                        </div>
                    </div>

                    {/* Featured Articles */}
                    {featuredArticle && (
                        <div className="mb-12">
                            <h2 className="text-lg font-bold text-neutral-900 mb-4 font-serif" style={{ fontFamily: 'Bree Serif, serif' }}>
                                Featured
                            </h2>
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Large Featured Article */}
                                <div
                                    className="lg:col-span-2 bg-white rounded-2xl overflow-hidden cursor-pointer border border-neutral-100 shadow-sm hover:shadow-md transition-all group"
                                    onClick={() => navigate(`/resources/articles/${featuredArticle.slug}`)}
                                >
                                    {featuredArticle.image ? (
                                        <img
                                            src={featuredArticle.image}
                                            alt={featuredArticle.title}
                                            className="w-full h-64 object-cover group-hover:scale-105 transition-transform duration-500"
                                        />
                                    ) : (
                                        <div className="h-64 bg-[#fff3db] flex items-center justify-center">
                                            <span className="text-xs text-neutral-400">No Image</span>
                                        </div>
                                    )}
                                    <div className="p-6">
                                        <span className="inline-block px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded-lg text-xs font-medium mb-3">
                                            {featuredArticle.category}
                                        </span>
                                        <h3 className="text-xl font-bold text-neutral-900 mb-2 font-serif" style={{ fontFamily: 'Bree Serif, serif' }}>
                                            {featuredArticle.title}
                                        </h3>
                                        <p className="text-xs text-neutral-500 mb-4 font-medium line-clamp-2">
                                            {featuredArticle.description}
                                        </p>
                                        <div className="flex items-center text-xs text-neutral-400 font-medium">
                                            <Clock size={12} className="mr-1" />
                                            <span>{featuredArticle.readTime}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Smaller Featured Articles */}
                                <div className="space-y-6">
                                    {otherFeatured.map((article) => (
                                        <div
                                            key={article._id}
                                            className="bg-white rounded-2xl overflow-hidden cursor-pointer border border-neutral-100 shadow-sm hover:shadow-md transition-all p-4 group"
                                            onClick={() => navigate(`/resources/articles/${article.slug}`)}
                                        >
                                            <div className="flex gap-4">
                                                {article.image ? (
                                                    <img
                                                        src={article.image}
                                                        alt={article.title}
                                                        className="w-20 h-20 rounded-xl object-cover flex-shrink-0 group-hover:scale-105 transition-transform"
                                                    />
                                                ) : (
                                                    <div className="w-20 h-20 bg-[#fff3db] rounded-xl flex-shrink-0 flex items-center justify-center">
                                                        <span className="text-xs text-neutral-400">No Image</span>
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <span className="inline-block px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded-lg text-xs font-medium mb-2">
                                                        {article.category}
                                                    </span>
                                                    <h4 className="text-sm font-bold text-neutral-900 mb-1 line-clamp-2">
                                                        {article.title}
                                                    </h4>
                                                    <div className="flex items-center text-xs text-neutral-400 font-medium">
                                                        <Clock size={10} className="mr-1" />
                                                        <span>{article.readTime}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* All Articles Section */}
                    <div>
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                            <h2 className="text-lg font-bold text-neutral-900 font-serif" style={{ fontFamily: 'Bree Serif, serif' }}>
                                All Articles
                            </h2>
                            
                            {/* Category Tags */}
                            <div className="flex flex-wrap gap-2">
                                {categories.slice(0, 5).map((category) => (
                                    <button
                                        key={category}
                                        onClick={() => setSelectedCategory(category)}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${selectedCategory === category
                                            ? 'bg-[#0097b2] text-white'
                                            : 'bg-white text-neutral-600 hover:bg-neutral-50 border border-neutral-100'
                                            }`}
                                    >
                                        {category}
                                    </button>
                                ))}
                                {categories.length > 5 && (
                                    <select
                                        value={selectedCategory}
                                        onChange={(e) => setSelectedCategory(e.target.value)}
                                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white text-neutral-600 border border-neutral-100 focus:outline-none"
                                    >
                                        <option value="" disabled>More...</option>
                                        {categories.slice(5).map((category) => (
                                            <option key={category} value={category}>{category}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>

                        {/* Articles Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {filteredArticles.map((article) => (
                                <div
                                    key={article._id}
                                    className="bg-white rounded-2xl overflow-hidden cursor-pointer border border-neutral-100 shadow-sm hover:shadow-md transition-all group"
                                    onClick={() => navigate(`/resources/articles/${article.slug}`)}
                                >
                                    {article.image ? (
                                        <img
                                            src={article.image}
                                            alt={article.title}
                                            className="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-500"
                                        />
                                    ) : (
                                        <div className="h-40 bg-[#fff3db] flex items-center justify-center">
                                            <span className="text-xs text-neutral-400">No Image</span>
                                        </div>
                                    )}
                                    <div className="p-5">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="inline-block px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded-lg text-xs font-medium">
                                                {article.category}
                                            </span>
                                            <div className="flex items-center text-xs text-neutral-400 font-medium">
                                                <Clock size={12} className="mr-1" />
                                                <span>{article.readTime}</span>
                                            </div>
                                        </div>
                                        <h3 className="text-sm font-bold text-neutral-900 mb-2 line-clamp-2">
                                            {article.title}
                                        </h3>
                                        <p className="text-xs text-neutral-500 line-clamp-2 font-medium">
                                            {article.description}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* CTA Sidebar - Fixed on right for desktop */}
                <div className="hidden xl:block w-80 flex-shrink-0">
                    <div className="sticky top-24 bg-white rounded-2xl p-6 border border-neutral-100 shadow-sm">
                        <h3 className="text-lg font-bold text-neutral-900 mb-2 font-serif" style={{ fontFamily: 'Bree Serif, serif' }}>
                            Need Professional Support?
                        </h3>
                        <p className="text-xs text-neutral-500 mb-6 font-medium leading-relaxed">
                            Connect with expert therapists and psychiatrists to support your mental health journey.
                        </p>
                        <button
                            onClick={() => navigate('/choose-professional')}
                            className="w-full px-4 py-2.5 bg-[#0097b2] hover:bg-[#007c93] text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                        >
                            Find a Therapist
                            <ArrowRight size={14} />
                        </button>

                        <div className="mt-8 pt-6 border-t border-neutral-100">
                            <h4 className="text-sm font-bold text-neutral-900 mb-2 font-serif" style={{ fontFamily: 'Bree Serif, serif' }}>
                                Vetted Content
                            </h4>
                            <p className="text-xs text-neutral-500 font-medium leading-relaxed">
                                All our resources are reviewed by licensed mental health professionals to ensure accuracy.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ArticlesPage;
