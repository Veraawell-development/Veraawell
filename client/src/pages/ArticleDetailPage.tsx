import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Loader2, ArrowRight, Clock, Home, Link2, MessageCircle, Twitter, Linkedin,
    ThumbsUp, ThumbsDown, ChevronRight, ArrowLeft
} from 'lucide-react';
import { API_BASE_URL } from '../config/api';

interface Article {
    _id: string;
    slug: string;
    title: string;
    description: string;
    content: string;
    category: string;
    tags: string[];
    readTime: string;
    image: string;
    author: string;
    publishedDate: string;
    views: number;
}

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

const ArticleDetailPage: React.FC = () => {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const [article, setArticle] = useState<Article | null>(null);
    const [relatedArticles, setRelatedArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);
    const [scrollProgress, setScrollProgress] = useState(0);
    const [copied, setCopied] = useState(false);
    const [feedback, setFeedback] = useState<'yes' | 'no' | null>(null);

    useEffect(() => {
        const handleScroll = () => {
            const h = document.documentElement, b = document.body;
            const progress = (h.scrollTop || b.scrollTop) / ((h.scrollHeight || b.scrollHeight) - h.clientHeight) * 100;
            setScrollProgress(progress);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        const fetchArticle = async () => {
            try {
                setLoading(true);
                const response = await fetch(`${API_BASE_URL}/articles/${slug}`);
                if (!response.ok) throw new Error('Article not found');
                const articleData = await response.json();
                setArticle(articleData);
                fetch(`${API_BASE_URL}/articles/${articleData._id}/view`, { method: 'POST' }).catch(() => {});
                const relatedResponse = await fetch(`${API_BASE_URL}/articles?category=${encodeURIComponent(articleData.category)}&limit=4`);
                if (relatedResponse.ok) {
                    const relatedData = await relatedResponse.json();
                    setRelatedArticles(relatedData.articles.filter((a: Article) => a._id !== articleData._id).slice(0, 3));
                }
            } catch {
                setArticle(null);
            } finally {
                setLoading(false);
            }
        };
        if (slug) fetchArticle();
    }, [slug]);

    const handleCopy = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-8 h-8 text-[#0097b2] animate-spin" />
                    <p className="text-[13px] text-gray-400 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>Loading article...</p>
                </div>
            </div>
        );
    }

    if (!article) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9] p-4">
                <div className="text-center max-w-sm">
                    
                    <h1 className="text-[28px] font-bold text-[#1A1A1A] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Article not found
                    </h1>
                    <p className="text-[14px] text-gray-500 mb-6 leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
                        This article may have been moved or archived.
                    </p>
                    <button
                        onClick={() => navigate('/resources/articles')}
                        className="px-6 py-2.5 bg-[#0097b2] text-white text-[14px] font-semibold rounded-full hover:bg-[#007a91] transition-colors"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                        Back to Articles
                    </button>
                </div>
            </div>
        );
    }

    const catStyle = getCategoryStyle(article.category);

    return (
        <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: 'Inter, sans-serif' }}>

            {/* Reading Progress Bar */}
            <div
                className="fixed top-0 left-0 h-[3px] bg-[#0097b2] z-[100] transition-all duration-100"
                style={{ width: `${scrollProgress}%` }}
            />

            {/* Sticky Top Breadcrumb */}
            <div className="bg-white border-b border-gray-100">
                <div className="max-w-6xl mx-auto px-4 md:px-8 py-4 flex items-center gap-2 text-[13px] text-gray-400">
                    <button onClick={() => navigate('/')} className="hover:text-[#0097b2] transition-colors flex items-center gap-1">
                        <Home size={13} /> Home
                    </button>
                    <ChevronRight size={13} className="text-gray-300" />
                    <button onClick={() => navigate('/resources/articles')} className="hover:text-[#0097b2] transition-colors">
                        Articles
                    </button>
                    <ChevronRight size={13} className="text-gray-300" />
                    <span className="text-gray-600 font-medium line-clamp-1 max-w-[200px]">{article.title}</span>
                </div>
            </div>

            {/* Hero + Title Area */}
            <div className="bg-white border-b border-gray-100">
                <div className="max-w-6xl mx-auto px-4 md:px-8 py-10 md:py-14">
                    <button
                        onClick={() => navigate('/resources/articles')}
                        className="flex items-center gap-2 text-[13px] text-gray-400 hover:text-[#0097b2] transition-colors mb-8 group"
                    >
                        <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
                        All Articles
                    </button>

                    <div className="max-w-[720px]">
                        <span
                            className="inline-block px-3 py-1 rounded-full text-[12px] font-semibold mb-5"
                            style={{ backgroundColor: catStyle.bg, color: catStyle.text }}
                        >
                            {article.category}
                        </span>
                        <h1 className="text-[30px] md:text-[44px] font-extrabold text-[#1A1A1A] leading-tight mb-6" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {article.title}
                        </h1>
                        <p className="text-[16px] text-gray-500 leading-relaxed mb-8">
                            {article.description}
                        </p>

                        {/* Meta */}
                        <div className="flex flex-wrap items-center gap-4 text-[13px] text-gray-400 pb-8 border-b border-gray-100">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-[#F3ECE5] flex items-center justify-center text-[#BE7959] font-bold text-[11px]">
                                    {article.author?.charAt(0) || 'A'}
                                </div>
                                <span className="font-semibold text-gray-700 text-[14px]">{article.author}</span>
                            </div>
                            <span className="text-gray-200">|</span>
                            <div className="flex items-center gap-1.5">
                                <Clock size={13} />
                                <span>{article.readTime}</span>
                            </div>
                            {article.publishedDate && (
                                <>
                                    <span className="text-gray-200">|</span>
                                    <span>
                                        {new Date(article.publishedDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-6xl mx-auto px-4 md:px-8 py-10 flex flex-col lg:flex-row gap-10 lg:gap-14">

                {/* Article Body */}
                <div className="flex-1 min-w-0">
                    <div className="bg-white rounded-[32px] p-6 md:p-10 lg:p-12 shadow-sm border border-gray-100">
                        {/* Featured Image */}
                        {article.image && (
                            <div className="mb-10 rounded-[20px] overflow-hidden shadow-sm">
                                <img
                                    src={article.image}
                                    alt={article.title}
                                    className="w-full h-auto object-cover max-h-[440px]"
                                />
                            </div>
                        )}

                        {/* Content */}
                        <div 
                            className="article-body" 
                            dangerouslySetInnerHTML={{ __html: article.content.replace(/&nbsp;/g, ' ') }} 
                        />

                        {/* Inline Promo */}
                        <div className="mt-12 bg-gradient-to-r from-[#0097b2] to-[#38ABAE] rounded-[20px] p-6 md:p-8 flex flex-col sm:flex-row items-center gap-6">
                            <div className="flex-1">
                                <p className="text-white font-bold text-[18px] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    Start Your Healing Journey
                                </p>
                                <p className="text-white/80 text-[13px] leading-relaxed">
                                    Get 15% off your first 3 sessions. Use code <strong className="text-white">FIRST15</strong>
                                </p>
                            </div>
                            <button
                                onClick={() => navigate('/choose-professional')}
                                className="flex-shrink-0 bg-white text-[#0097b2] font-bold text-[13px] px-6 py-3 rounded-full hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2"
                            >
                                Book a Session <ArrowRight size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Tags */}
                    {article.tags && article.tags.length > 0 && (
                        <div className="mt-10 pt-8 border-t border-gray-100">
                            <p className="text-[12px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Tags</p>
                            <div className="flex flex-wrap gap-2">
                                {article.tags.map(tag => (
                                    <span key={tag} className="px-3 py-1 bg-white border border-gray-200 text-gray-500 rounded-full text-[13px] font-medium hover:border-gray-400 transition-colors cursor-default">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Related Articles */}
                    {relatedArticles.length > 0 && (
                        <div className="mt-14">
                            <div className="flex items-center gap-3 mb-6">
                                <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Related Articles</span>
                                <div className="flex-1 h-px bg-gray-100" />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {relatedArticles.map((rel) => {
                                    const relCat = getCategoryStyle(rel.category);
                                    return (
                                        <div
                                            key={rel._id}
                                            onClick={() => navigate(`/resources/articles/${rel.slug}`)}
                                            className="group bg-white rounded-[16px] border border-gray-100 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                                        >
                                            {rel.image ? (
                                                <img src={rel.image} alt={rel.title} className="w-full h-[120px] object-cover group-hover:scale-105 transition-transform duration-500" />
                                            ) : (
                                                <div className="w-full h-[120px] bg-gradient-to-br from-[#E0F7FA] to-[#B2EBF2] flex items-center justify-center"><span className="text-xs text-[#0097b2] font-bold tracking-widest uppercase">Veraawell</span></div>
                                            )}
                                            <div className="p-4">
                                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: relCat.bg, color: relCat.text }}>
                                                    {rel.category}
                                                </span>
                                                <h4 className="text-[13px] font-bold text-[#1A1A1A] mt-2 line-clamp-2 group-hover:text-[#0097b2] transition-colors leading-snug">
                                                    {rel.title}
                                                </h4>
                                                <div className="flex items-center gap-1 mt-2 text-[11px] text-gray-400">
                                                    <Clock size={10} /> {rel.readTime}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Sidebar */}
                <div className="w-full lg:w-[300px] flex-shrink-0">
                    <div className="sticky top-24 space-y-5">

                        {/* Booking CTA */}
                        <div className="bg-white border border-gray-100 rounded-[20px] p-6 shadow-sm">
                            <div className="flex justify-center -space-x-2 mb-5">
                                {[
                                    'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=80&h=80&fit=crop',
                                    'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=80&h=80&fit=crop',
                                    'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=80&h=80&fit=crop',
                                ].map((src, i) => (
                                    <img key={i} src={src} alt="Therapist" className="w-10 h-10 rounded-full border-2 border-white object-cover" style={{ zIndex: i }} />
                                ))}
                            </div>
                            <h3 className="text-[16px] font-bold text-[#1A1A1A] text-center mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Talk to a Professional
                            </h3>
                            <p className="text-[13px] text-gray-500 text-center mb-5 leading-relaxed">
                                Connect with licensed therapists at Veraawell. First session at 15% off.
                            </p>
                            <button
                                onClick={() => navigate('/choose-professional')}
                                className="w-full py-3 bg-[#0097b2] hover:bg-[#007a91] text-white text-[13px] font-bold rounded-full transition-colors"
                            >
                                Book Now
                            </button>
                        </div>

                        {/* Share */}
                        <div className="bg-white border border-gray-100 rounded-[20px] p-5 shadow-sm">
                            <p className="text-[13px] font-bold text-[#1A1A1A] mb-1">Share this article</p>
                            <p className="text-[12px] text-gray-400 mb-4">Help someone who might need to read this.</p>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleCopy}
                                    title={copied ? 'Copied!' : 'Copy link'}
                                    className={`w-9 h-9 rounded-full border flex items-center justify-center transition-all ${copied ? 'border-green-300 bg-green-50 text-green-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                >
                                    <Link2 size={15} />
                                </button>
                                <button
                                    onClick={() => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(article.title + ' ' + window.location.href)}`)}
                                    className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-green-500 hover:bg-green-50 transition-all"
                                >
                                    <MessageCircle size={15} />
                                </button>
                                <button
                                    onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(window.location.href)}`)}
                                    className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-blue-400 hover:bg-blue-50 transition-all"
                                >
                                    <Twitter size={15} />
                                </button>
                                <button
                                    onClick={() => window.open(`https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(window.location.href)}&title=${encodeURIComponent(article.title)}`)}
                                    className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-blue-600 hover:bg-blue-50 transition-all"
                                >
                                    <Linkedin size={15} />
                                </button>
                            </div>
                        </div>

                        {/* Feedback */}
                        <div className="bg-white border border-gray-100 rounded-[20px] p-5 shadow-sm">
                            <p className="text-[13px] font-bold text-[#1A1A1A] mb-1 text-center">Was this helpful?</p>
                            <p className="text-[12px] text-gray-400 mb-4 text-center">Let us know how we're doing.</p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setFeedback('yes')}
                                    className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-2 text-[13px] font-semibold transition-all border ${
                                        feedback === 'yes'
                                            ? 'border-green-400 bg-green-50 text-green-600'
                                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                    }`}
                                >
                                    <ThumbsUp size={14} /> Yes
                                </button>
                                <button
                                    onClick={() => setFeedback('no')}
                                    className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-2 text-[13px] font-semibold transition-all border ${
                                        feedback === 'no'
                                            ? 'border-red-400 bg-red-50 text-red-500'
                                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                    }`}
                                >
                                    <ThumbsDown size={14} /> No
                                </button>
                            </div>
                            {feedback && (
                                <p className="text-center text-[12px] text-gray-400 mt-3">
                                    {feedback === 'yes' ? 'Thank you for your feedback!' : "We'll work to improve this."}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Article Styles */}
            <style>{`
                .article-body {
                    font-family: 'Inter', sans-serif;
                    color: #4b5563; /* Gray-600 for better readability */
                    font-size: 17px;
                    line-height: 1.85;
                    overflow-wrap: break-word;
                    word-wrap: break-word;
                }
                .article-body h2 {
                    font-family: 'Inter', sans-serif;
                    color: #111827; /* Gray-900 */
                    font-size: 26px;
                    font-weight: 700;
                    margin-top: 48px;
                    margin-bottom: 20px;
                    line-height: 1.3;
                }
                .article-body h3 {
                    font-family: 'Inter', sans-serif;
                    color: #111827;
                    font-size: 20px;
                    font-weight: 700;
                    margin-top: 40px;
                    margin-bottom: 16px;
                }
                .article-body p {
                    margin-bottom: 24px;
                }
                .article-body strong {
                    color: #111827;
                    font-weight: 600;
                }
                .article-body ul {
                    margin-bottom: 28px;
                    padding-left: 24px;
                    list-style-type: disc;
                }
                .article-body ol {
                    margin-bottom: 28px;
                    padding-left: 24px;
                    list-style-type: decimal;
                }
                .article-body li {
                    margin-bottom: 12px;
                    color: #4b5563;
                    padding-left: 8px;
                }
                .article-body li::marker {
                    color: #0097b2;
                    font-weight: bold;
                }
                .article-body img {
                    border-radius: 16px;
                    margin: 36px 0;
                    width: 100%;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
                }
                .article-body blockquote {
                    border-left: 4px solid #0097b2;
                    margin: 32px 0;
                    padding: 20px 24px;
                    background: #F0FBFD;
                    border-radius: 0 16px 16px 0;
                    font-style: italic;
                    color: #007a91;
                    font-size: 18px;
                }
                .article-body a {
                    color: #0097b2;
                    text-decoration: underline;
                    text-underline-offset: 4px;
                    font-weight: 500;
                }
                .article-body a:hover {
                    color: #007a91;
                    text-decoration-thickness: 2px;
                }
            `}</style>
        </div>
    );
};

export default ArticleDetailPage;
