import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

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

    const API_BASE_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:5001'
        : 'https://veraawell-backend.onrender.com';

    useEffect(() => {
        const fetchArticle = async () => {
            try {
                setLoading(true);
                // 1. Fetch Article Data
                const response = await fetch(`${API_BASE_URL}/api/articles/${slug}`);

                if (!response.ok) {
                    throw new Error('Article not found');
                }

                const articleData = await response.json();
                setArticle(articleData);

                // 2. Increment Views (fire and forget)
                fetch(`${API_BASE_URL}/api/articles/${articleData._id}/view`, { method: 'POST' });

                // 3. Fetch Related Articles
                const relatedResponse = await fetch(`${API_BASE_URL}/api/articles?category=${encodeURIComponent(articleData.category)}&limit=4`);
                if (relatedResponse.ok) {
                    const relatedData = await relatedResponse.json();
                    // Filter out current article and limit to 3
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
            <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6]">
                <Loader2 className="w-12 h-12 text-teal-600 animate-spin" />
            </div>
        );
    }

    if (!article) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FAF9F6' }}>
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Bree Serif, serif' }}>
                        Article Not Found
                    </h1>
                    <button
                        onClick={() => navigate('/resources/articles')}
                        className="px-6 py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                        Back to Articles
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen" style={{ backgroundColor: '#FAF9F6' }}>
            {/* Breadcrumb */}
            <div className="bg-white border-b border-gray-200">
                <div className="max-w-4xl mx-auto px-4 py-4">
                    <div className="flex items-center text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                        <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-700">
                            Home
                        </button>
                        <svg className="w-4 h-4 mx-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <button onClick={() => navigate('/resources')} className="text-gray-500 hover:text-gray-700">
                            Resources
                        </button>
                        <svg className="w-4 h-4 mx-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <button onClick={() => navigate('/resources/articles')} className="text-gray-500 hover:text-gray-700">
                            Articles
                        </button>
                        <svg className="w-4 h-4 mx-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-gray-900 font-medium truncate">{article.title.substring(0, 30)}...</span>
                    </div>
                </div>
            </div>

            {/* Article Content */}
            <div className="max-w-4xl mx-auto px-4 py-12">
                {/* Article Header */}
                <div className="mb-8">
                    <span className="inline-block px-4 py-1.5 bg-teal-100 text-teal-700 rounded-full text-sm font-medium mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {article.category}
                    </span>
                    <h1 className="text-5xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Bree Serif, serif' }}>
                        {article.title}
                    </h1>
                    <div className="flex items-center gap-4 text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                        <span className="font-semibold">ARTICLE</span>
                        <span>|</span>
                        <span>{article.readTime}</span>
                        <span>|</span>
                        <span>{article.publishedDate ? new Date(article.publishedDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Draft'}</span>
                        <span>|</span>
                        <span>{article.views} views</span>
                    </div>
                </div>

                <div className="mb-12 rounded-xl overflow-hidden bg-gray-100 h-96 relative">
                    {article.image ? (
                        <img
                            src={article.image}
                            alt={article.title}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-teal-100 to-cyan-100 flex items-center justify-center">
                            <span className="text-teal-600 opacity-50 text-4xl font-bold">Veraawell</span>
                        </div>
                    )}
                </div>

                {/* Article Content */}
                <div className="bg-white rounded-xl p-8 mb-12 border border-gray-200">
                    <div
                        className="prose prose-lg max-w-none"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                        dangerouslySetInnerHTML={{ __html: article.content }}
                    />
                </div>

                {/* Author Info */}
                <div className="bg-gray-50 rounded-xl p-6 mb-12 border border-gray-200">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center text-teal-600 font-bold text-xl uppercase">
                            {article.author.charAt(0)}
                        </div>
                        <div>
                            <p className="font-semibold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Written by {article.author}
                            </p>
                            <p className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Mental Health Professional
                            </p>
                        </div>
                    </div>
                </div>

                {/* Related Articles */}
                {relatedArticles.length > 0 && (
                    <div>
                        <h2 className="text-3xl font-bold text-gray-900 mb-6" style={{ fontFamily: 'Bree Serif, serif' }}>
                            Related Articles
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {relatedArticles.map((related) => (
                                <div
                                    key={related._id}
                                    className="bg-white rounded-xl overflow-hidden cursor-pointer hover:shadow-lg transition-all border border-gray-200"
                                    onClick={() => navigate(`/resources/articles/${related.slug}`)}
                                >
                                    <div className="h-40 bg-gray-100 relative">
                                        {related.image ? (
                                            <img
                                                src={related.image}
                                                alt={related.title}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-gradient-to-br from-purple-100 to-pink-100"></div>
                                        )}
                                    </div>
                                    <div className="p-4">
                                        <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs font-medium mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                                            {related.category}
                                        </span>
                                        <h3 className="text-base font-bold text-gray-900 mb-2 line-clamp-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                                            {related.title}
                                        </h3>
                                        <span className="text-xs text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
                                            {related.readTime}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* CTA Section */}
                <div className="bg-gradient-to-r from-teal-600 to-cyan-600 rounded-xl p-8 text-center text-white mt-12">
                    <h3 className="text-2xl font-bold mb-3" style={{ fontFamily: 'Bree Serif, serif' }}>
                        Need Professional Guidance?
                    </h3>
                    <p className="text-lg mb-6" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Connect with qualified therapists who can provide personalized support
                    </p>
                    <button
                        onClick={() => navigate('/choose-professional')}
                        className="px-8 py-3 bg-white text-teal-600 rounded-lg font-semibold hover:shadow-lg transition-all"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                        Find a Therapist
                    </button>
                </div>
            </div>

            <style>{`
        .prose h2 {
          font-family: 'Bree Serif', serif;
          font-size: 2rem;
          font-weight: bold;
          color: #1a202c;
          margin-top: 2rem;
          margin-bottom: 1rem;
        }
        .prose h3 {
          font-family: 'Bree Serif', serif;
          font-size: 1.5rem;
          font-weight: bold;
          color: #2d3748;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .prose h4 {
          font-family: 'Inter', sans-serif;
          font-size: 1.25rem;
          font-weight: 600;
          color: #2d3748;
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
        }
        .prose p {
          color: #4a5568;
          line-height: 1.75;
          margin-bottom: 1rem;
        }
        .prose ul, .prose ol {
          margin-left: 1.5rem;
          margin-bottom: 1rem;
        }
        .prose li {
          color: #4a5568;
          margin-bottom: 0.5rem;
        }
        .prose strong {
          color: #2d3748;
          font-weight: 600;
        }
      `}</style>
        </div>
    );
};

export default ArticleDetailPage;
