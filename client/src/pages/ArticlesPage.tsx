import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataSocket } from '../hooks/useDataSocket';
import toast from 'react-hot-toast';
import { Search, Clock, ArrowUpRight, ChevronRight } from 'lucide-react';
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
    'Anxiety disorders',
    'Bipolar disorder',
    'Depression',
    'Depressive disorders',
    'Lack of Motivation',
    'Negative thinking',
    'Relationship Struggles'
];

// Category color palette
const categoryColors: Record<string, { bg: string; text: string }> = {
    'Addiction': { bg: '#EDE9FB', text: '#6350C9' },
    'Adult ADHD': { bg: '#FDEBD5', text: '#C1692B' },
    'Anger management': { bg: '#FDEBD5', text: '#C1692B' },
    'Anxiety disorders': { bg: '#D5F3F4', text: '#0097b2' },
    'Bipolar disorder': { bg: '#FCE4EC', text: '#C2185B' },
    'Depression': { bg: '#E8F5E9', text: '#2E7D32' },
    'Depressive disorders': { bg: '#E8F5E9', text: '#2E7D32' },
    'Lack of Motivation': { bg: '#FFF9C4', text: '#A87F00' },
    'Negative thinking': { bg: '#FCEEE8', text: '#BE7959' },
    'Relationship Struggles': { bg: '#FCE4EC', text: '#C2185B' },
};

const getCategoryStyle = (cat: string) =>
    categoryColors[cat] || { bg: '#F0F0F0', text: '#555555' };

const ArticlesPage: React.FC = () => {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [articles, setArticles] = useState<Article[]>([]);
    const [showAllCategories, setShowAllCategories] = useState(false);

    const { socket } = useDataSocket();

    useEffect(() => {
        fetchArticles();
    }, [searchQuery, selectedCategory]);

    useEffect(() => {
        if (!socket) return;
        socket.on('article:new', ({ article }) => {
            toast.success(`New article: ${article.title}`);
            fetchArticles();
        });
        socket.on('article:deleted', ({ articleId }) => {
            toast('An article was removed', { icon: 'info' });
            setArticles(prev => prev.filter(a => a._id !== articleId));
        });
        return () => {
            socket.off('article:new');
            socket.off('article:deleted');
        };
    }, [socket]);

    const fetchArticles = async () => {
        try {
            const params = new URLSearchParams({ search: searchQuery, category: selectedCategory, limit: '100' });
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
    const allArticles = articles;
    const visibleCategories = showAllCategories ? categories : categories.slice(0, 7);

    return (
        <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: 'Inter, sans-serif' }}>

            {/* Page Header */}
            <div className="w-full bg-white border-b border-gray-100">
                <div className="max-w-6xl mx-auto px-4 md:px-8 py-12 md:py-16">
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-1.5 text-[13px] text-gray-400 mb-6">
                        <button onClick={() => navigate('/')} className="hover:text-[#0097b2] transition-colors">Home</button>
                        <ChevronRight size={13} className="text-gray-300" />
                        <span className="text-gray-700 font-medium">Wellness Articles</span>
                    </div>

                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div>
                            <h1 className="text-[36px] md:text-[48px] font-extrabold text-[#1A1A1A] leading-tight mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Wellness Articles
                            </h1>
                            <p className="text-[15px] text-gray-500 max-w-md leading-relaxed">
                                Clinically vetted insights on mental health, written by professionals who care.
                            </p>
                        </div>

                        {/* Search */}
                        <div className="relative w-full md:w-72 flex-shrink-0">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="Search articles..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 text-[14px] rounded-2xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#0097b2]/30 focus:border-[#0097b2] transition-all"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4 md:px-8 py-10">

                {/* Category Pills */}
                <div className="flex flex-wrap gap-2 mb-10">
                    {visibleCategories.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-4 py-2 rounded-full text-[13px] font-semibold transition-all duration-200 ${
                                selectedCategory === cat
                                    ? 'bg-[#0097b2] text-white shadow-sm'
                                    : 'bg-white text-gray-600 border border-gray-200 hover:border-[#0097b2] hover:text-[#0097b2]'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                    {categories.length > 7 && (
                        <button
                            onClick={() => setShowAllCategories(!showAllCategories)}
                            className="px-4 py-2 rounded-full text-[13px] font-semibold bg-white text-gray-400 border border-gray-200 hover:border-gray-400 transition-all"
                        >
                            {showAllCategories ? 'Show less' : `+${categories.length - 7} more`}
                        </button>
                    )}
                </div>

                {/* Featured Article */}
                {featuredArticle && selectedCategory === 'All' && !searchQuery && (
                    <div className="mb-12">
                        <div className="flex items-center gap-3 mb-5">
                            <span className="text-[11px] font-bold uppercase tracking-widest text-[#0097b2]">Featured</span>
                            <div className="flex-1 h-px bg-gray-100" />
                        </div>
                        <div
                            className="group cursor-pointer bg-white rounded-[24px] overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col md:flex-row"
                            onClick={() => navigate(`/resources/articles/${featuredArticle.slug}`)}
                        >
                            <div className="w-full md:w-[48%] h-[280px] md:h-auto overflow-hidden flex-shrink-0">
                                {featuredArticle.image ? (
                                    <img
                                        src={featuredArticle.image}
                                        alt={featuredArticle.title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-gradient-to-br from-[#E0F7FA] to-[#B2EBF2] flex items-center justify-center">
                                        <span className="text-sm text-[#0097b2] font-semibold tracking-wider uppercase">Veraawell</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 p-8 md:p-12 flex flex-col justify-center">
                                <span
                                    className="inline-block px-3 py-1 rounded-full text-[12px] font-semibold mb-4 w-fit"
                                    style={{
                                        backgroundColor: getCategoryStyle(featuredArticle.category).bg,
                                        color: getCategoryStyle(featuredArticle.category).text,
                                    }}
                                >
                                    {featuredArticle.category}
                                </span>
                                <h2 className="text-[24px] md:text-[30px] font-extrabold text-[#1A1A1A] leading-tight mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    {featuredArticle.title}
                                </h2>
                                <p className="text-[14px] text-gray-500 leading-relaxed mb-6 line-clamp-3">
                                    {featuredArticle.description}
                                </p>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 text-[13px] text-gray-400">
                                        <div className="w-7 h-7 rounded-full bg-[#F3ECE5] flex items-center justify-center text-[#BE7959] font-bold text-[11px]">
                                            {featuredArticle.author?.charAt(0) || 'A'}
                                        </div>
                                        <span className="font-medium text-gray-600">{featuredArticle.author}</span>
                                        <span>·</span>
                                        <Clock size={13} />
                                        <span>{featuredArticle.readTime}</span>
                                    </div>
                                    <div className="w-9 h-9 rounded-full bg-[#0097b2] flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <ArrowUpRight size={16} className="text-white" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Articles Grid */}
                <div>
                    <div className="flex items-center gap-3 mb-6">
                        <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                            {searchQuery ? `Results for "${searchQuery}"` : selectedCategory === 'All' ? 'All Articles' : selectedCategory}
                        </span>
                        <div className="flex-1 h-px bg-gray-100" />
                        <span className="text-[12px] text-gray-400">{allArticles.length} articles</span>
                    </div>

                    {allArticles.length === 0 ? (
                        <div className="text-center py-20">
                            
                            <h3 className="text-[18px] font-bold text-gray-700 mb-2">No articles found</h3>
                            <p className="text-[14px] text-gray-400">Try a different search or category.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {allArticles.map((article) => {
                                const catStyle = getCategoryStyle(article.category);
                                return (
                                    <div
                                        key={article._id}
                                        onClick={() => navigate(`/resources/articles/${article.slug}`)}
                                        className="group bg-white rounded-[20px] overflow-hidden border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col"
                                    >
                                        <div className="h-[190px] overflow-hidden bg-gray-50 flex-shrink-0">
                                            {article.image ? (
                                                <img
                                                    src={article.image}
                                                    alt={article.title}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-gradient-to-br from-[#E0F7FA] to-[#B2EBF2] flex items-center justify-center">
                                                    <span className="text-sm text-[#0097b2] font-semibold tracking-wider uppercase">Veraawell</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-5 flex flex-col flex-1">
                                            <div className="flex items-center justify-between mb-3">
                                                <span
                                                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold"
                                                    style={{ backgroundColor: catStyle.bg, color: catStyle.text }}
                                                >
                                                    {article.category}
                                                </span>
                                                <div className="flex items-center gap-1 text-[12px] text-gray-400">
                                                    <Clock size={11} />
                                                    <span>{article.readTime}</span>
                                                </div>
                                            </div>
                                            <h3 className="text-[15px] font-bold text-[#1A1A1A] mb-2 leading-snug line-clamp-2 group-hover:text-[#0097b2] transition-colors">
                                                {article.title}
                                            </h3>
                                            <p className="text-[13px] text-gray-400 leading-relaxed line-clamp-2 flex-1">
                                                {article.description}
                                            </p>
                                            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                                                <div className="w-6 h-6 rounded-full bg-[#F3ECE5] flex items-center justify-center text-[#BE7959] font-bold text-[10px]">
                                                    {article.author?.charAt(0) || 'A'}
                                                </div>
                                                <span className="text-[12px] text-gray-500 font-medium">{article.author}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Bottom CTA Banner */}
                <div className="mt-16 bg-gradient-to-r from-[#0097b2] to-[#38ABAE] rounded-[24px] p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div>
                        <h3 className="text-[24px] md:text-[28px] font-extrabold text-white mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Ready to Talk to Someone?
                        </h3>
                        <p className="text-white/80 text-[14px] leading-relaxed max-w-md">
                            Connect with licensed therapists and psychologists — at your pace, on your terms.
                        </p>
                    </div>
                    <button
                        onClick={() => navigate('/choose-professional')}
                        className="flex-shrink-0 bg-white text-[#0097b2] font-bold text-[14px] px-8 py-3.5 rounded-full hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2"
                    >
                        Find a Therapist <ArrowUpRight size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ArticlesPage;
