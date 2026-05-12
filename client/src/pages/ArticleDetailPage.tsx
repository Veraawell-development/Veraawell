import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, ArrowRight, Clock, Eye, Home } from 'lucide-react';
import BackToDashboard from '../components/BackToDashboard';
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

const ArticleDetailPage: React.FC = () => {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const [article, setArticle] = useState<Article | null>(null);
    const [relatedArticles, setRelatedArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);
    const [scrollProgress, setScrollProgress] = useState(0);

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
                const response = await fetch(`${API_BASE_URL}/articles/${slug}`);

                if (!response.ok) {
                    throw new Error('Article not found');
                }

                const articleData = await response.json();
                setArticle(articleData);

                // Increment Views
                fetch(`${API_BASE_URL}/articles/${articleData._id}/view`, { method: 'POST' });

                // Fetch Related Articles
                const relatedResponse = await fetch(`${API_BASE_URL}/articles?category=${encodeURIComponent(articleData.category)}&limit=4`);
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
            <div className="min-h-screen flex items-center justify-center bg-[#fcfbfa]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 text-[#0097b2] animate-spin" />
                    <p className="text-xs text-neutral-500 font-medium animate-pulse">Loading story...</p>
                </div>
            </div>
        );
    }

    if (!article) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#fcfbfa] p-4">
                <div className="text-center max-w-md">
                    <h1 className="text-3xl font-bold text-neutral-900 mb-4 font-serif" style={{ fontFamily: 'Bree Serif, serif' }}>
                        Lost in thought?
                    </h1>
                    <p className="text-xs text-neutral-500 mb-6 font-medium leading-relaxed">
                        We couldn't find the article you're looking for. It might have been moved or archived.
                    </p>
                    <button
                        onClick={() => navigate('/resources/articles')}
                        className="px-6 py-2.5 bg-[#0097b2] hover:bg-[#007c93] text-white text-xs font-semibold rounded-xl transition-colors"
                    >
                        Explore Other Articles
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#fcfbfa]">
            {/* Reading Progress Bar */}
            <div
                className="fixed top-0 left-0 h-1 bg-[#0097b2] z-[100] transition-all duration-150 ease-out"
                style={{ width: `${scrollProgress}%` }}
            />

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
                        <button onClick={() => navigate('/resources/articles')} className="hover:text-[#0097b2] transition-colors">
                            Articles
                        </button>
                        <span className="mx-2 text-neutral-300">/</span>
                        <span className="text-neutral-900 truncate max-w-[200px]">{article.title}</span>
                    </div>
                </div>
            </div>

            {/* Content Container */}
            <article className="max-w-4xl mx-auto py-12 px-4">
                
                <BackToDashboard className="mb-8" />

                {/* Hero Section */}
                <header className="text-center mb-12">
                    <span className="inline-block px-2 py-0.5 bg-[#fff3db] text-[#0097b2] rounded-lg text-xs font-semibold mb-4">
                        {article.category}
                    </span>

                    <h1 className="text-3xl md:text-5xl font-bold text-neutral-900 mb-6 leading-tight font-serif" style={{ fontFamily: 'Bree Serif, serif' }}>
                        {article.title}
                    </h1>

                    <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-neutral-400 font-medium">
                        <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 text-xs font-bold uppercase">
                                {article.author.charAt(0)}
                            </div>
                            <span className="text-neutral-700 font-semibold">{article.author}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Clock size={12} />
                            <span>{article.readTime}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Clock size={12} />
                            <span>{article.publishedDate ? new Date(article.publishedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Draft'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Eye size={12} />
                            <span>{article.views} views</span>
                        </div>
                    </div>
                </header>

                {/* Main Feature Image */}
                <div className="mb-12">
                    <div className="rounded-2xl overflow-hidden shadow-sm aspect-video relative">
                        {article.image ? (
                            <img
                                src={article.image}
                                alt={article.title}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full bg-[#fff3db] flex items-center justify-center">
                                <span className="text-neutral-400 text-sm font-medium">No Image</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Article Prose Body */}
                <div className="mb-12">
                    <div
                        className="prose prose-neutral max-w-none article-body"
                        dangerouslySetInnerHTML={{ __html: article.content }}
                    />

                    {/* Tags */}
                    {article.tags && article.tags.length > 0 && (
                        <div className="mt-8 pt-6 border-t border-neutral-100 flex flex-wrap gap-2">
                            {article.tags.map(tag => (
                                <span key={tag} className="px-2 py-0.5 bg-neutral-100 text-neutral-500 rounded-lg text-xs font-medium">
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Call to Action Section */}
                <div className="bg-[#fff3db] rounded-2xl p-8 text-center border border-neutral-100 mb-12">
                    <h3 className="text-xl font-bold text-neutral-900 mb-2 font-serif" style={{ fontFamily: 'Bree Serif, serif' }}>
                        Experience clarity with Veerawell
                    </h3>
                    <p className="text-xs text-neutral-600 mb-6 max-w-2xl mx-auto font-medium leading-relaxed">
                        Don't navigate your journey alone. Our expert therapists are here to help you turn insights into lasting positive change.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <button
                            onClick={() => navigate('/choose-professional')}
                            className="px-6 py-2.5 bg-[#0097b2] hover:bg-[#007c93] text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-2"
                        >
                            Book a Discovery Session
                            <ArrowRight size={14} />
                        </button>
                        <button
                            onClick={() => navigate('/resources/articles')}
                            className="px-6 py-2.5 bg-white hover:bg-neutral-50 text-neutral-600 text-xs font-semibold rounded-xl border border-neutral-100 transition-colors"
                        >
                            Browse More Topics
                        </button>
                    </div>
                </div>

                {/* Related Reads */}
                {relatedArticles.length > 0 && (
                    <section className="border-t border-neutral-100 pt-12">
                        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                            <div>
                                <h2 className="text-xl font-bold text-neutral-900 font-serif" style={{ fontFamily: 'Bree Serif, serif' }}>Related Content</h2>
                                <p className="text-xs text-neutral-500 font-medium">Hand-picked articles to broaden your perspective.</p>
                            </div>
                            <button
                                onClick={() => navigate('/resources/articles')}
                                className="text-[#0097b2] text-xs font-bold hover:text-[#007c93] flex items-center gap-1 group"
                            >
                                View Library
                                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {relatedArticles.map((related) => (
                                <div
                                    key={related._id}
                                    className="bg-white rounded-2xl overflow-hidden cursor-pointer border border-neutral-100 shadow-sm hover:shadow-md transition-all flex flex-col group"
                                    onClick={() => navigate(`/resources/articles/${related.slug}`)}
                                >
                                    <div className="h-40 relative overflow-hidden">
                                        {related.image ? (
                                            <img
                                                src={related.image}
                                                alt={related.title}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-[#fff3db] flex items-center justify-center">
                                                <span className="text-neutral-400 text-xs">No Image</span>
                                            </div>
                                        )}
                                        <div className="absolute top-3 left-3">
                                            <span className="px-2 py-0.5 bg-white/90 backdrop-blur-sm text-neutral-600 rounded-lg text-xs font-semibold">
                                                {related.category}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="p-4 flex-1 flex flex-col">
                                        <h3 className="text-sm font-bold text-neutral-900 mb-2 line-clamp-2 leading-tight group-hover:text-[#0097b2] transition-colors">
                                            {related.title}
                                        </h3>
                                        <div className="mt-auto flex items-center justify-between text-xs text-neutral-400 font-medium">
                                            <span>{related.readTime}</span>
                                            <span>{new Date(related.publishedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </article>

            <style>{`
                .article-body {
                    font-family: 'Inter', sans-serif;
                    color: #404040;
                    overflow-wrap: break-word;
                }
                
                .article-body h2, .article-body h3, .article-body h4 {
                    font-family: 'Bree Serif', serif;
                    color: #171717;
                    margin-top: 2rem;
                    margin-bottom: 1rem;
                }
                
                .article-body h2 { font-size: 1.5rem; line-height: 1.3; }
                .article-body h3 { font-size: 1.25rem; line-height: 1.3; }
                
                .article-body p {
                    font-size: 1rem;
                    line-height: 1.6;
                    margin-bottom: 1rem;
                    font-weight: 500;
                }
                
                .article-body strong {
                    color: #171717;
                    font-weight: 700;
                }
                
                .article-body ul, .article-body ol {
                    margin-bottom: 1rem;
                    padding-left: 1.25rem;
                    font-size: 1rem;
                    line-height: 1.6;
                }
                
                .article-body li {
                    margin-bottom: 0.5rem;
                }

                .article-body img {
                    border-radius: 1rem;
                    margin: 1.5rem 0;
                    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
                }
            `}</style>
        </div>
    );
};

export default ArticleDetailPage;
