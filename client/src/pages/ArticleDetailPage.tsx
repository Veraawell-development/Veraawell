import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Loader2, ArrowRight, Clock, Home, Link2, MessageCircle, Twitter, Linkedin,
    ThumbsUp, ThumbsDown, ChevronRight, ArrowLeft
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '../config/api';
import SparkDecor from '../components/ui/SparkDecor';
import LeafDecor from '../components/ui/LeafDecor';

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

    const { data: article = null, isLoading: loading } = useQuery({
        queryKey: ['article', slug],
        queryFn: async () => {
            const response = await fetch(`${API_BASE_URL}/articles/${slug}`);
            if (!response.ok) throw new Error('Article not found');
            return response.json();
        },
        enabled: !!slug
    });

    const { data: relatedArticles = [] } = useQuery({
        queryKey: ['articles', 'related', article?.category],
        queryFn: async () => {
            const relatedResponse = await fetch(`${API_BASE_URL}/articles?category=${encodeURIComponent(article.category)}&limit=4`);
            if (!relatedResponse.ok) throw new Error('Failed to fetch related articles');
            const relatedData = await relatedResponse.json();
            return relatedData.articles.filter((a: Article) => a._id !== article._id).slice(0, 3);
        },
        enabled: !!article?.category
    });

    useEffect(() => {
        if (article) {
            fetch(`${API_BASE_URL}/articles/${article._id}/view`, { method: 'POST' }).catch(() => {});
        }
    }, [article?._id]);

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
        <div className="min-h-screen bg-[var(--bg)] relative overflow-hidden font-sans">
            <Helmet>
                <title>{article.title} | Veraawell Articles</title>
                <meta name="description" content={article.description} />
                <meta property="og:title" content={`${article.title} | Veraawell`} />
                <meta property="og:description" content={article.description} />
                {article.image && <meta property="og:image" content={article.image} />}
                <link rel="canonical" href={`https://veraawell.com/resources/articles/${article.slug}`} />
                <script type="application/ld+json">
                    {JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "Article",
                        "headline": article.title,
                        "description": article.description,
                        "image": article.image ? [article.image] : [],
                        "datePublished": article.publishedDate ? new Date(article.publishedDate).toISOString() : new Date().toISOString(),
                        "author": [{
                            "@type": "Person",
                            "name": article.author || "Veraawell Professional"
                        }],
                        "publisher": {
                            "@type": "Organization",
                            "name": "Veraawell",
                            "logo": {
                                "@type": "ImageObject",
                                "url": "https://veraawell.com/logo/1.png"
                            }
                        }
                    })}
                </script>
            </Helmet>
            {/* Reading Progress Bar */}
            <div
                className="fixed top-0 left-0 h-[4px] bg-gradient-to-r from-[var(--teal-muted)] to-[var(--teal)] z-[100] transition-all duration-100"
                style={{ width: `${scrollProgress}%` }}
            />

            {/* ── Background Immersive Gradients & Decor ── */}
            <div 
              className="absolute top-[-5%] left-[-10%] w-[60vw] h-[60vw] rounded-full mix-blend-multiply filter blur-[120px] opacity-40 z-0 pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(0,151,178,0.1) 0%, transparent 70%)', animation: 'blob-drift 25s ease-in-out infinite alternate' }}
            />
            <div 
              className="absolute top-[10%] right-[-10%] w-[50vw] h-[50vw] rounded-full mix-blend-multiply filter blur-[100px] opacity-40 z-0 pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(224,122,95,0.08) 0%, transparent 70%)', animation: 'blob-drift-2 20s ease-in-out infinite alternate' }}
            />
            
            <div className="absolute top-[15%] right-[15%] pointer-events-none z-0 hidden lg:block opacity-60">
              <SparkDecor color="var(--teal)" style={{ width: '60px', height: '60px', animation: 'float-card 7s ease-in-out infinite alternate-reverse' }} />
            </div>

            {/* ── Hero + Title Area ── */}
            <div className="relative z-10 pt-32 pb-16">
                <div className="max-w-4xl mx-auto px-4 md:px-8 text-center flex flex-col items-center">
                    <button
                        onClick={() => navigate('/resources/articles')}
                        className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-widest text-[var(--text-3)] hover:text-[var(--teal)] transition-colors mb-10 group"
                        style={{ fontFamily: 'var(--font-mono)' }}
                    >
                        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                        Back to Articles
                    </button>

                    <span
                        className="inline-block px-4 py-1.5 rounded-full text-[13px] font-bold mb-6 tracking-wide shadow-sm"
                        style={{ backgroundColor: catStyle.bg, color: catStyle.text }}
                    >
                        {article.category}
                    </span>
                    
                    <h1 className="text-[36px] md:text-[56px] font-extrabold text-[var(--text)] leading-[1.1] mb-8" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                        {article.title}
                    </h1>
                    
                    <p className="text-[18px] md:text-[20px] text-[var(--text-2)] leading-relaxed mb-12 max-w-3xl" style={{ fontFamily: 'var(--font-body)' }}>
                        {article.description}
                    </p>

                    {/* Premium Meta */}
                    <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-[#F3ECE5] flex items-center justify-center text-[var(--coral)] font-bold text-[15px] shadow-sm">
                                {article.author?.charAt(0) || 'A'}
                            </div>
                            <div className="flex flex-col text-left">
                                <span className="font-bold text-[15px] text-[var(--text)]">{article.author}</span>
                                <div className="flex items-center gap-1.5 text-[13px] text-[var(--text-3)] font-medium mt-0.5">
                                    <Clock size={12} />
                                    <span>{article.readTime}</span>
                                </div>
                            </div>
                        </div>
                        
                        {article.publishedDate && (
                            <>
                                <div className="w-px h-10 bg-[var(--border)] hidden md:block"></div>
                                <div className="flex flex-col text-left">
                                    <span className="text-[12px] font-bold uppercase tracking-widest text-[var(--text-3)]" style={{ fontFamily: 'var(--font-mono)' }}>Published</span>
                                    <span className="font-medium text-[15px] text-[var(--text-2)] mt-0.5">
                                        {new Date(article.publishedDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Main Content Area ── */}
            <div className="relative z-10 max-w-[1400px] mx-auto px-4 md:px-8 pb-32 flex flex-col lg:flex-row gap-10 lg:gap-10 items-start">

                {/* Article Body */}
                <div className="flex-1 min-w-0 w-full">
                    <div className="bg-white rounded-[40px] p-6 md:p-10 lg:p-12 shadow-md border border-[var(--border)] relative overflow-hidden">
                        {/* Featured Image - Premium Frame */}
                        {article.image && (
                            <div className="mb-14 rounded-[32px] overflow-hidden bg-[#FDF6F3] relative group shadow-inner">
                                <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent z-10 pointer-events-none"></div>
                                <img
                                    src={article.image}
                                    alt={article.title}
                                    className="w-full h-auto object-cover max-h-[500px] mix-blend-multiply group-hover:scale-[1.02] transition-transform duration-700 ease-out"
                                />
                            </div>
                        )}

                        {/* Content */}
                        <div 
                            className="article-body" 
                            dangerouslySetInnerHTML={{ __html: article.content.replace(/&nbsp;/g, ' ') }} 
                        />

                        {/* Inline Promo */}
                        <div className="mt-16 bg-[var(--surface)] border border-[var(--border)] rounded-[32px] p-8 md:p-10 flex flex-col sm:flex-row items-center justify-between gap-8 relative overflow-hidden group hover:shadow-lg transition-all duration-300">
                            <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-[var(--teal-muted)] rounded-full filter blur-3xl opacity-20 group-hover:opacity-40 transition-opacity pointer-events-none"></div>
                            <div className="relative z-10">
                                <h3 className="text-[24px] font-bold text-[var(--text)] mb-2" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                                    Start Your Healing Journey
                                </h3>
                                <p className="text-[var(--text-2)] text-[15px] leading-relaxed">
                                    Get 15% off your first 3 sessions. Use code <strong className="text-[var(--teal)]">FIRST15</strong>
                                </p>
                            </div>
                            <button
                                onClick={() => navigate('/choose-professional')}
                                className="relative z-10 flex-shrink-0 bg-[var(--teal)] text-white font-medium text-[15px] px-8 py-4 rounded-full shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex items-center gap-2"
                            >
                                Book a Session <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── Sticky Sidebar ── */}
                <div className="w-full lg:w-[320px] flex-shrink-0 lg:sticky lg:top-32 space-y-8">
                    
                    {/* Floating Glassmorphic Bento CTA */}
                    <div className="bg-white/60 backdrop-blur-xl rounded-[32px] p-8 border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[var(--teal-muted)] to-[var(--coral-muted)] rounded-full filter blur-2xl opacity-30 group-hover:opacity-50 transition-opacity"></div>
                        
                        <div className="relative z-10 flex flex-col items-center text-center">
                            <div className="flex -space-x-4 mb-6">
                                <img src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&h=100&fit=crop" alt="Pro" className="w-14 h-14 rounded-full border-4 border-white shadow-sm object-cover" />
                                <img src="https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=100&h=100&fit=crop" alt="Pro" className="w-14 h-14 rounded-full border-4 border-white shadow-sm object-cover" />
                                <img src="https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=100&h=100&fit=crop" alt="Pro" className="w-14 h-14 rounded-full border-4 border-white shadow-sm object-cover" />
                            </div>
                            
                            <h3 className="text-[22px] font-bold text-[var(--text)] mb-3" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                                Talk to a Professional
                            </h3>
                            <p className="text-[14px] text-[var(--text-2)] mb-8 leading-relaxed">
                                Connect with licensed therapists at Veraawell. First session at 15% off.
                            </p>
                            
                            <button
                                onClick={() => navigate('/choose-professional')}
                                className="w-full bg-[var(--teal)] text-white font-semibold text-[15px] py-4 rounded-full shadow-md hover:shadow-lg hover:bg-[var(--teal-dark)] hover:-translate-y-0.5 transition-all duration-300"
                            >
                                Book Now
                            </button>
                        </div>
                    </div>

                    {/* Sharing */}
                    <div className="bg-white rounded-[32px] p-8 border border-[var(--border)] shadow-sm">
                        <h4 className="text-[12px] font-bold uppercase tracking-widest text-[var(--text-3)] mb-6 text-center" style={{ fontFamily: 'var(--font-mono)' }}>
                            Share this article
                        </h4>
                        <div className="flex items-center justify-center gap-4">
                            <button onClick={handleCopy} className="w-12 h-12 rounded-full bg-[var(--surface)] hover:bg-[var(--teal)] text-[var(--text-2)] hover:text-white flex items-center justify-center transition-all duration-300">
                                <Link2 size={18} />
                            </button>
                            <button className="w-12 h-12 rounded-full bg-[var(--surface)] hover:bg-[#1DA1F2] text-[var(--text-2)] hover:text-white flex items-center justify-center transition-all duration-300">
                                <Twitter size={18} />
                            </button>
                            <button className="w-12 h-12 rounded-full bg-[var(--surface)] hover:bg-[#0A66C2] text-[var(--text-2)] hover:text-white flex items-center justify-center transition-all duration-300">
                                <Linkedin size={18} />
                            </button>
                        </div>
                        {copied && <p className="text-center text-[12px] text-[var(--teal)] font-medium mt-4">Link copied!</p>}
                    </div>
                </div>
            </div>

            <style>{`
                .article-body {
                    font-family: var(--font-body);
                    color: var(--text-2);
                    font-size: 18px;
                    line-height: 1.75;
                }
                .article-body h2 {
                    font-family: var(--font-display);
                    color: var(--text);
                    font-size: 32px;
                    font-weight: 700;
                    margin-top: 56px;
                    margin-bottom: 24px;
                    line-height: 1.2;
                    letter-spacing: -0.02em;
                }
                .article-body h3 {
                    font-family: var(--font-display);
                    color: var(--text);
                    font-size: 24px;
                    font-weight: 700;
                    margin-top: 48px;
                    margin-bottom: 20px;
                    letter-spacing: -0.01em;
                }
                .article-body p {
                    margin-bottom: 20px;
                }
                .article-body strong {
                    color: var(--text);
                    font-weight: 600;
                }
                .article-body ul {
                    margin-bottom: 32px;
                    padding-left: 24px;
                    list-style-type: none;
                }
                .article-body li {
                    margin-bottom: 16px;
                    position: relative;
                    padding-left: 16px;
                }
                .article-body li::before {
                    content: '•';
                    color: var(--teal);
                    font-weight: bold;
                    position: absolute;
                    left: 0;
                }
                .article-body blockquote {
                    border-left: 4px solid var(--teal);
                    margin: 40px 0;
                    padding: 24px 32px;
                    background: var(--surface);
                    border-radius: 0 24px 24px 0;
                    font-style: italic;
                    color: var(--text);
                    font-size: 20px;
                }
                .article-body a {
                    color: var(--teal);
                    text-decoration: underline;
                    text-underline-offset: 4px;
                    font-weight: 500;
                }
                .article-body a:hover {
                    color: var(--teal-dark);
                    text-decoration-thickness: 2px;
                }
            `}</style>
        </div>
    );
};

export default ArticleDetailPage;
