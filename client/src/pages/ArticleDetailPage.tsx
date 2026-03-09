import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import BackToDashboard from '../components/BackToDashboard';

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

const ArticleDetailPage: React.FC = () => {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const [article, setArticle] = useState<Article | null>(null);
    const [relatedArticles, setRelatedArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);
    const [scrollProgress, setScrollProgress] = useState(0);

    const API_BASE_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:5001'
        : 'https://veraawell-backend.onrender.com';

    useEffect(() => {
        const handleScroll = () => {
            const h = document.documentElement,
                b = document.body,
                st = 'scrollTop',
                sh = 'scrollHeight';
            const progress = (h[st] || b[st]) / ((h[sh] || b[sh]) - h.clientHeight) * 100;
            setScrollProgress(progress);
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        const fetchArticle = async () => {
            try {
                setLoading(true);
                const response = await fetch(`${API_BASE_URL}/api/articles/${slug}`);

                if (!response.ok) {
                    throw new Error('Article not found');
                }

                const articleData = await response.json();
                setArticle(articleData);

                // Increment Views
                fetch(`${API_BASE_URL}/api/articles/${articleData._id}/view`, { method: 'POST' });

                // Fetch Related Articles
                const relatedResponse = await fetch(`${API_BASE_URL}/api/articles?category=${encodeURIComponent(articleData.category)}&limit=4`);
                if (relatedResponse.ok) {
                    const relatedData = await relatedResponse.json();
                    setRelatedArticles(
                        relatedData.articles
                            .filter((a: Article) => a._id !== articleData._id)
                            .slice(0, 3)
                    );
                }

            } catch (error) {
                console.error('Error fetching article:', error);
                setArticle(null);
            } finally {
                setLoading(false);
            }
        };

        if (slug) {
            fetchArticle();
        }
    }, [slug]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 text-teal-600 animate-spin transition-all" />
                    <p className="text-gray-400 font-medium animate-pulse">Loading story...</p>
                </div>
            </div>
        );
    }

    if (!article) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white p-4">
                <div className="text-center max-w-md">
                    <h1 className="text-4xl font-bold text-gray-900 mb-6 font-bree-serif">
                        Lost in thought?
                    </h1>
                    <p className="text-gray-600 mb-8 font-inter">
                        We couldn't find the article you're looking for. It might have been moved or archived.
                    </p>
                    <button
                        onClick={() => navigate('/resources/articles')}
                        className="w-full px-6 py-4 bg-teal-600 text-white rounded-2xl font-bold hover:bg-teal-700 transition-all shadow-lg hover:shadow-teal-100"
                    >
                        Explore Other Articles
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white">
            {/* Reading Progress Bar */}
            <div
                className="fixed top-0 left-0 h-1.5 bg-teal-600 z-[100] transition-all duration-150 ease-out shadow-[0_0_10px_rgba(13,148,136,0.3)]"
                style={{ width: `${scrollProgress}%` }}
            />

            {/* Content Container */}
            <article className="max-w-screen-xl mx-auto">
                {/* Hero Section */}
                <header className="px-4 py-12 md:py-20 max-w-4xl mx-auto text-center">
                    <div className="mb-8 flex justify-center">
                        <BackToDashboard className="mb-0" />
                    </div>

                    <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 bg-teal-50 text-teal-700 rounded-full text-sm font-semibold tracking-wide uppercase transition-colors">
                        <span className="w-1.5 h-1.5 bg-teal-500 rounded-full"></span>
                        {article.category}
                    </div>

                    <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-8 leading-[1.1] font-bree-serif tracking-tight break-words">
                        {article.title}
                    </h1>

                    <div className="flex flex-wrap items-center justify-center gap-y-4 gap-x-8 text-sm md:text-base text-gray-500 font-medium">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-bold uppercase">
                                {article.author.charAt(0)}
                            </div>
                            <span className="text-gray-800 font-semibold">{article.author}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {article.readTime}
                        </div>
                        <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {article.publishedDate ? new Date(article.publishedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Draft'}
                        </div>
                        <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            {article.views} views
                        </div>
                    </div>
                </header>

                {/* Main Feature Image */}
                <div className="px-4 mb-20">
                    <div className="max-w-5xl mx-auto rounded-3xl overflow-hidden shadow-2xl shadow-gray-200 aspect-video relative group">
                        {article.image ? (
                            <img
                                src={article.image}
                                alt={article.title}
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                            />
                        ) : (
                            <div className="w-full h-full bg-gradient-to-br from-teal-50 to-cyan-50 flex items-center justify-center">
                                <span className="text-teal-200 text-6xl font-bold font-bree-serif">Veraawell</span>
                            </div>
                        )}
                        <div className="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-colors duration-500"></div>
                    </div>
                </div>

                {/* Article Prose Body */}
                <div className="px-4 pb-20">
                    <div className="max-w-3xl mx-auto">
                        <div
                            className="prose prose-lg md:prose-xl max-w-none article-body"
                            dangerouslySetInnerHTML={{ __html: article.content }}
                        />

                        {/* Tags */}
                        {article.tags && article.tags.length > 0 && (
                            <div className="mt-16 pt-8 border-t border-gray-100 flex flex-wrap gap-2">
                                {article.tags.map(tag => (
                                    <span key={tag} className="px-3 py-1 bg-gray-50 text-gray-500 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors cursor-default">
                                        #{tag}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Call to Action Section */}
                <div className="px-4 pb-20">
                    <div className="max-w-4xl mx-auto bg-gray-900 rounded-[2.5rem] p-12 text-center text-white relative overflow-hidden shadow-2xl">
                        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-teal-500/20 rounded-full blur-3xl"></div>
                        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl"></div>

                        <div className="relative z-10">
                            <h3 className="text-3xl md:text-4xl font-bold mb-6 font-bree-serif">
                                Experience clarity with Veerawell
                            </h3>
                            <p className="text-xl text-gray-300 mb-10 max-w-2xl mx-auto font-inter">
                                Don't navigate your journey alone. Our expert therapists are here to help you turn insights into lasting positive change.
                            </p>
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                <button
                                    onClick={() => navigate('/choose-professional')}
                                    className="w-full sm:w-auto px-10 py-4 bg-teal-600 text-white rounded-2xl font-bold hover:bg-teal-700 transition-all shadow-lg shadow-teal-900/40 hover:-translate-y-1"
                                >
                                    Book a Discovery Session
                                </button>
                                <button
                                    onClick={() => navigate('/resources/articles')}
                                    className="w-full sm:w-auto px-10 py-4 bg-white/10 text-white rounded-2xl font-bold hover:bg-white/20 transition-all backdrop-blur-sm"
                                >
                                    Browse More Topics
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Related Reads */}
                {relatedArticles.length > 0 && (
                    <section className="bg-gray-50/50 py-24 px-4 border-t border-gray-100">
                        <div className="max-w-6xl mx-auto">
                            <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4">
                                <div>
                                    <h2 className="text-4xl font-bold text-gray-900 font-bree-serif">Related Content</h2>
                                    <p className="text-gray-500 mt-2 font-inter">Hand-picked articles to broaden your perspective.</p>
                                </div>
                                <button
                                    onClick={() => navigate('/resources/articles')}
                                    className="text-teal-600 font-bold hover:text-teal-700 flex items-center gap-2 group"
                                >
                                    View Library
                                    <span className="transition-transform group-hover:translate-x-1">→</span>
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                {relatedArticles.map((related) => (
                                    <div
                                        key={related._id}
                                        className="bg-white rounded-[2rem] overflow-hidden cursor-pointer hover:shadow-2xl hover:shadow-gray-200/50 transition-all duration-300 flex flex-col group border border-gray-100"
                                        onClick={() => navigate(`/resources/articles/${related.slug}`)}
                                    >
                                        <div className="h-48 relative overflow-hidden">
                                            {related.image ? (
                                                <img
                                                    src={related.image}
                                                    alt={related.title}
                                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-teal-50"></div>
                                            )}
                                            <div className="absolute top-4 left-4">
                                                <span className="px-3 py-1 bg-white/90 backdrop-blur-sm text-gray-900 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm">
                                                    {related.category}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="p-8 flex-1 flex flex-col">
                                            <h3 className="text-xl font-bold text-gray-900 mb-4 line-clamp-2 leading-tight font-bree-serif group-hover:text-teal-600 transition-colors">
                                                {related.title}
                                            </h3>
                                            <div className="mt-auto flex items-center justify-between text-sm text-gray-400 font-medium font-inter">
                                                <span>{related.readTime}</span>
                                                <span className="w-1 h-1 bg-gray-200 rounded-full"></span>
                                                <span>{new Date(related.publishedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                )}
            </article>

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Bree+Serif&family=Inter:wght@400;500;600;700&display=swap');
                
                .font-bree-serif { font-family: 'Bree Serif', serif; }
                .font-inter { font-family: 'Inter', sans-serif; }
                
                .article-body {
                    font-family: 'Inter', sans-serif;
                    color: #374151;
                    overflow-wrap: break-word;
                    word-wrap: break-word;
                    word-break: break-word;
                    hyphens: auto;
                }
                
                .article-body h2, .article-body h3, .article-body h4 {
                    font-family: 'Bree Serif', serif;
                    color: #111827;
                    overflow-wrap: break-word;
                    word-break: break-word;
                }

                .article-body img, .article-body table {
                    max-width: 100%;
                    height: auto;
                }
                
                .article-body h2 {
                    font-size: 2.25rem;
                    line-height: 1.2;
                    margin-top: 3.5rem;
                    margin-bottom: 1.5rem;
                }
                
                .article-body h3 {
                    font-family: 'Bree Serif', serif;
                    font-size: 1.75rem;
                    line-height: 1.3;
                    margin-top: 2.5rem;
                    margin-bottom: 1.25rem;
                    color: #111827;
                }
                
                .article-body p {
                    font-size: 1.25rem;
                    line-height: 1.8;
                    margin-bottom: 1.5rem;
                    letter-spacing: -0.011em;
                }
                
                .article-body strong {
                    color: #111827;
                    font-weight: 700;
                }
                
                .article-body ul, .article-body ol {
                    margin-bottom: 1.5rem;
                    padding-left: 1.5rem;
                    font-size: 1.25rem;
                    line-height: 1.8;
                }
                
                .article-body li {
                    margin-bottom: 0.75rem;
                }

                @media (max-width: 768px) {
                    .article-body h2 { 
                        font-size: 1.75rem; 
                        margin-top: 2.5rem;
                        line-height: 1.3;
                    }
                    .article-body h3 { 
                        font-size: 1.35rem; 
                        margin-top: 2rem;
                    }
                    .article-body p { 
                        font-size: 1.1rem; 
                        line-height: 1.7;
                        margin-bottom: 1.25rem;
                    }
                    .article-body ul, .article-body ol { 
                        font-size: 1.1rem; 
                        line-height: 1.7;
                        padding-left: 1.25rem;
                    }
                }
            `}</style>
        </div>
    );
};

export default ArticleDetailPage;
