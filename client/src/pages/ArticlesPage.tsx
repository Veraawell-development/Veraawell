import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataSocket } from '../hooks/useDataSocket';
import toast from 'react-hot-toast';
import { Search, Clock, ArrowUpRight, ChevronRight } from 'lucide-react';
import { API_BASE_URL } from '../config/api';
import { useScrollReveal } from '../hooks/useScrollReveal';
import SparkDecor from '../components/ui/SparkDecor';
import LeafDecor from '../components/ui/LeafDecor';

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

    const headerRef = useScrollReveal<HTMLDivElement>();
    const categoriesRef = useScrollReveal<HTMLDivElement>();
    const featuredRef = useScrollReveal<HTMLDivElement>();
    const gridRef = useScrollReveal<HTMLDivElement>();
    const ctaRef = useScrollReveal<HTMLDivElement>();


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
        <div className="min-h-screen bg-[var(--bg)] relative overflow-hidden font-sans">

            {/* ── Background Immersive Gradients & Decor ── */}
            <div 
              className="absolute top-[-10%] left-[-20%] w-[80vw] h-[80vw] rounded-full mix-blend-multiply filter blur-[120px] opacity-40 z-0 pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(0,151,178,0.12) 0%, transparent 70%)', animation: 'blob-drift 25s ease-in-out infinite alternate' }}
            />
            <div 
              className="absolute bottom-[-10%] right-[-10%] w-[70vw] h-[70vw] rounded-full mix-blend-multiply filter blur-[100px] opacity-40 z-0 pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(224,122,95,0.08) 0%, transparent 70%)', animation: 'blob-drift-2 20s ease-in-out infinite alternate' }}
            />
            
            <div className="absolute top-[20%] right-[10%] pointer-events-none z-0 hidden lg:block opacity-60">
              <SparkDecor color="var(--teal)" style={{ width: '80px', height: '80px', animation: 'float-card 7s ease-in-out infinite alternate-reverse' }} />
            </div>

            {/* ── Page Header ── */}
            <div className="w-full relative z-10 pt-32 pb-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center">
                    
                    <span className="text-xs font-medium tracking-widest uppercase block mb-4" style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>
                        — Resources
                    </span>
                    <h1 className="leading-tight mb-6" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(40px, 5vw, 64px)', color: 'var(--text)', letterSpacing: '-0.02em' }}>
                        Wellness Articles
                    </h1>
                    <p className="text-[18px] md:text-[20px] text-[var(--text-2)] max-w-2xl leading-relaxed mb-10" style={{ fontFamily: 'var(--font-body)' }}>
                        Clinically vetted insights on mental health, written by professionals who care.
                    </p>

                    {/* Premium Search */}
                    <div className="relative w-full max-w-xl group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-[var(--teal-muted)] to-[var(--coral-muted)] rounded-[32px] blur opacity-25 group-hover:opacity-40 transition duration-500"></div>
                        <div className="relative flex items-center bg-[var(--surface)] border border-[var(--border)] rounded-[32px] px-6 py-4 shadow-sm focus-within:border-[var(--teal)] transition-colors">
                            <Search className="w-5 h-5 text-[var(--text-3)]" />
                            <input
                                type="text"
                                placeholder="Search by topic, keyword, or author..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-transparent pl-4 pr-4 outline-none text-[16px] text-[var(--text)] placeholder:text-[var(--text-3)]"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-32 relative z-10">

                {/* ── Category Pills ── */}
                <div ref={categoriesRef} data-reveal className="flex flex-wrap items-center justify-center gap-3 mb-16">
                    {visibleCategories.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-5 py-2.5 rounded-full text-[14px] font-medium transition-all duration-300 ${
                                selectedCategory === cat
                                    ? 'bg-[var(--teal)] text-white shadow-md scale-105'
                                    : 'bg-[var(--surface)] text-[var(--text-2)] border border-[var(--border)] hover:border-[var(--teal)] hover:text-[var(--teal)]'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                    {categories.length > 7 && (
                        <button
                            onClick={() => setShowAllCategories(!showAllCategories)}
                            className="px-5 py-2.5 rounded-full text-[14px] font-medium bg-[var(--surface)] text-[var(--text-3)] border border-[var(--border)] hover:border-[var(--text-2)] transition-all"
                        >
                            {showAllCategories ? 'Show less' : `+${categories.length - 7} more`}
                        </button>
                    )}
                </div>

                {/* ── Featured Article Bento Card ── */}
                {featuredArticle && selectedCategory === 'All' && !searchQuery && (
                    <div className="mb-20">
                        <div className="flex items-center gap-4 mb-8">
                            <span className="text-[12px] font-bold uppercase tracking-widest" style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>
                                Featured Read
                            </span>
                            <div className="flex-1 h-px bg-[var(--border)]" />
                        </div>
                        
                        <div
                            className="group cursor-pointer bg-white rounded-[40px] p-4 md:p-6 border border-[var(--border)] shadow-sm hover:shadow-2xl transition-all duration-500 flex flex-col lg:flex-row relative gap-6 md:gap-12"
                            onClick={() => navigate(`/resources/articles/${featuredArticle.slug}`)}
                        >
                            {/* ── Image Canvas Frame ── */}
                            <div className="w-full lg:w-[55%] h-[300px] md:h-[480px] overflow-hidden relative rounded-[32px] bg-[#FDF6F3] flex items-center justify-center">
                                {/* Subtle inner glow */}
                                <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent z-10 pointer-events-none"></div>
                                
                                {featuredArticle.image ? (
                                    <img
                                        src={featuredArticle.image}
                                        alt={featuredArticle.title}
                                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700 ease-out mix-blend-multiply"
                                    />
                                ) : (
                                    <div className="absolute inset-0 bg-gradient-to-br from-[#E0F7FA] to-[#B2EBF2] flex items-center justify-center group-hover:scale-105 transition-transform duration-700 ease-out">
                                        <span className="text-lg text-[var(--teal)] font-bold tracking-widest uppercase">Veraawell</span>
                                    </div>
                                )}
                            </div>
                            
                            {/* ── Content Side ── */}
                            <div className="w-full lg:w-[45%] py-4 md:py-8 pr-4 md:pr-10 flex flex-col justify-center relative">
                                {/* Decorative floating element */}
                                <div className="absolute top-0 right-0 w-48 h-48 bg-[var(--teal-muted)] rounded-full filter blur-[80px] opacity-20 group-hover:opacity-40 transition-opacity pointer-events-none"></div>
                                
                                <div className="relative z-10">
                                    <span
                                        className="inline-block px-4 py-1.5 rounded-full text-[12px] font-bold mb-6 w-fit tracking-wide"
                                        style={{
                                            backgroundColor: getCategoryStyle(featuredArticle.category).bg,
                                            color: getCategoryStyle(featuredArticle.category).text,
                                        }}
                                    >
                                        {featuredArticle.category}
                                    </span>
                                    <h2 className="text-[32px] md:text-[44px] font-bold text-[var(--text)] leading-[1.1] mb-6 group-hover:text-[var(--teal)] transition-colors" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                                        {featuredArticle.title}
                                    </h2>
                                    <p className="text-[16px] md:text-[18px] text-[var(--text-2)] leading-relaxed mb-10 line-clamp-3">
                                        {featuredArticle.description}
                                    </p>
                                    
                                    <div className="flex items-center justify-between mt-auto">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-full bg-[#F3ECE5] flex items-center justify-center text-[var(--coral)] font-bold text-[15px] shadow-sm">
                                                {featuredArticle.author?.charAt(0) || 'A'}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-[15px] text-[var(--text)]">{featuredArticle.author}</span>
                                                <div className="flex items-center gap-1.5 text-[13px] text-[var(--text-3)] font-medium mt-0.5">
                                                    <Clock size={12} />
                                                    <span>{featuredArticle.readTime}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="w-14 h-14 rounded-full bg-white border border-[var(--border)] flex items-center justify-center group-hover:bg-[var(--teal)] group-hover:border-[var(--teal)] group-hover:text-white group-hover:shadow-lg transition-all duration-300">
                                            <ArrowUpRight size={22} className="text-[var(--text-2)] group-hover:text-white transition-colors" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Articles Grid ── */}
                <div>
                    <div className="flex items-center gap-4 mb-10">
                        <span className="text-[12px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                            {searchQuery ? `Results for "${searchQuery}"` : selectedCategory === 'All' ? 'All Articles' : selectedCategory}
                        </span>
                        <div className="flex-1 h-px bg-[var(--border)]" />
                        <span className="text-[12px] font-medium text-[var(--text-3)] bg-[var(--surface)] px-3 py-1 rounded-full border border-[var(--border)]">
                            {allArticles.length} {allArticles.length === 1 ? 'article' : 'articles'}
                        </span>
                    </div>

                    {allArticles.length === 0 ? (
                        <div className="text-center py-32 bg-[var(--surface)] rounded-[32px] border border-[var(--border)]">
                            <h3 className="text-[24px] font-bold text-[var(--text)] mb-3" style={{ fontFamily: 'var(--font-display)' }}>No articles found</h3>
                            <p className="text-[16px] text-[var(--text-2)]">Try a different search or category.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {allArticles.map((article, index) => {
                                const catStyle = getCategoryStyle(article.category);
                                return (
                                    <div
                                        key={article._id}
                                        onClick={() => navigate(`/resources/articles/${article.slug}`)}
                                        className="group bg-[var(--surface)] rounded-[32px] overflow-hidden border border-[var(--border)] shadow-sm hover:shadow-xl hover:-translate-y-2 transition-all duration-500 cursor-pointer flex flex-col"
                                        style={{ animationDelay: `${index * 100}ms` }}
                                    >
                                        <div className="h-[240px] overflow-hidden bg-[#FDF6F3] relative">
                                            {article.image ? (
                                                <img
                                                    src={article.image}
                                                    alt={article.title}
                                                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                                                />
                                            ) : (
                                                <div className="absolute inset-0 bg-gradient-to-br from-[#E0F7FA] to-[#B2EBF2] flex items-center justify-center group-hover:scale-110 transition-transform duration-700 ease-out">
                                                    <span className="text-sm text-[var(--teal)] font-bold tracking-wider uppercase">Veraawell</span>
                                                </div>
                                            )}
                                            <div className="absolute top-4 left-4">
                                                <span
                                                    className="px-3 py-1.5 rounded-full text-[11px] font-bold shadow-sm backdrop-blur-md"
                                                    style={{ backgroundColor: 'rgba(255,255,255,0.9)', color: catStyle.text }}
                                                >
                                                    {article.category}
                                                </span>
                                            </div>
                                        </div>
                                        
                                        <div className="p-8 flex flex-col flex-1">
                                            <h3 className="text-[20px] font-bold text-[var(--text)] mb-3 leading-snug line-clamp-2 group-hover:text-[var(--teal)] transition-colors" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
                                                {article.title}
                                            </h3>
                                            <p className="text-[14px] text-[var(--text-2)] leading-relaxed line-clamp-2 flex-1 mb-6">
                                                {article.description}
                                            </p>
                                            
                                            <div className="flex items-center justify-between mt-auto pt-5 border-t border-[var(--border)]">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-[#F3ECE5] flex items-center justify-center text-[var(--coral)] font-bold text-[11px]">
                                                        {article.author?.charAt(0) || 'A'}
                                                    </div>
                                                    <span className="text-[13px] text-[var(--text-2)] font-semibold">{article.author}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-3)] font-medium">
                                                    <Clock size={12} />
                                                    <span>{article.readTime}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── Bottom CTA Banner ── */}
                <div className="mt-24 relative overflow-hidden bg-[var(--surface)] border border-[var(--border)] rounded-[32px] p-10 md:p-16 flex flex-col md:flex-row items-center justify-between gap-10 shadow-sm">
                    {/* Decorative Blob */}
                    <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-gradient-to-br from-[var(--teal-muted)] to-[var(--coral-muted)] rounded-full mix-blend-multiply filter blur-3xl opacity-30 pointer-events-none"></div>
                    
                    <div className="relative z-10">
                        <h3 className="text-[32px] md:text-[40px] font-bold text-[var(--text)] mb-4" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                            Ready to Talk to Someone?
                        </h3>
                        <p className="text-[var(--text-2)] text-[16px] md:text-[18px] leading-relaxed max-w-xl" style={{ fontFamily: 'var(--font-body)' }}>
                            Connect with licensed therapists and psychologists — at your pace, on your terms. Start your wellness journey today.
                        </p>
                    </div>
                    <button
                        onClick={() => navigate('/choose-professional')}
                        className="relative z-10 flex-shrink-0 bg-[var(--teal)] text-white font-medium text-[16px] px-8 py-4 rounded-full shadow-md hover:shadow-xl hover:-translate-y-1 hover:bg-[var(--teal-dark)] transition-all duration-300 flex items-center gap-2 group"
                    >
                        Find a Therapist 
                        <ArrowUpRight size={18} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ArticlesPage;
