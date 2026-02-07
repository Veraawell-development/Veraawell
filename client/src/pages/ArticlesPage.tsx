import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

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

    const API_BASE_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:5001'
        : 'https://veraawell-backend.onrender.com';

    useEffect(() => {
        fetchArticles();
    }, [searchQuery, selectedCategory]);

    const fetchArticles = async () => {
        try {
            const params = new URLSearchParams({
                search: searchQuery,
                category: selectedCategory,
                limit: '100'
            });

            const response = await fetch(`${API_BASE_URL}/api/articles?${params}`);
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
        <div className="min-h-screen" style={{ backgroundColor: '#FAF9F6' }}>
            {/* Breadcrumb */}
            <div className="bg-white border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 py-4">
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
                        <span className="text-gray-900 font-medium">Articles</span>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 py-12">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-4xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Bree Serif, serif' }}>
                            Most Read Articles
                        </h1>
                        <p className="text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Take control of your mental health with clinically vetted blogs and articles
                        </p>
                    </div>
                    <div className="relative w-80">
                        <input
                            type="text"
                            placeholder="Search resources"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full px-4 py-2 pr-10 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                            style={{ fontFamily: 'Inter, sans-serif' }}
                        />
                        <svg className="w-5 h-5 text-gray-400 absolute right-3 top-1/2 transform -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                </div>

                {/* Featured Articles */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
                    {/* Large Featured Article */}
                    {featuredArticle && (
                        <div
                            className="lg:col-span-2 bg-white rounded-xl overflow-hidden cursor-pointer hover:shadow-lg transition-all border border-gray-200"
                            onClick={() => navigate(`/resources/articles/${featuredArticle.slug}`)}
                        >
                            {featuredArticle.image ? (
                                <img
                                    src={featuredArticle.image}
                                    alt={featuredArticle.title}
                                    className="w-full h-64 object-cover"
                                />
                            ) : (
                                <div className="h-64 bg-gradient-to-br from-amber-100 to-orange-100"></div>
                            )}
                            <div className="p-6">
                                <span className="inline-block px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    {featuredArticle.category}
                                </span>
                                <h3 className="text-2xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Bree Serif, serif' }}>
                                    {featuredArticle.title}
                                </h3>
                                <p className="text-gray-600 mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    {featuredArticle.description}
                                </p>
                                <div className="flex items-center text-sm text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    <span>{featuredArticle.readTime}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Smaller Featured Articles */}
                    <div className="space-y-6">
                        {otherFeatured.map((article) => (
                            <div
                                key={article._id}
                                className="bg-white rounded-xl overflow-hidden cursor-pointer hover:shadow-lg transition-all border border-gray-200"
                                onClick={() => navigate(`/resources/articles/${article.slug}`)}
                            >
                                <div className="flex gap-4 p-4">
                                    {article.image ? (
                                        <img
                                            src={article.image}
                                            alt={article.title}
                                            className="w-24 h-24 rounded-lg object-cover flex-shrink-0"
                                        />
                                    ) : (
                                        <div className="w-24 h-24 bg-gradient-to-br from-blue-100 to-cyan-100 rounded-lg flex-shrink-0"></div>
                                    )}
                                    <div className="flex-1">
                                        <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs font-medium mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                                            {article.category}
                                        </span>
                                        <h4 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                                            {article.title}
                                        </h4>
                                        <span className="text-xs text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
                                            {article.readTime}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* All Articles Section */}
                <div>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>
                            All Articles
                        </h2>
                        <div className="relative w-80">
                            <input
                                type="text"
                                placeholder="Search articles"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full px-4 py-2 pr-10 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                            />
                            <svg className="w-5 h-5 text-gray-400 absolute right-3 top-1/2 transform -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                    </div>

                    {/* Category Tags */}
                    <div className="flex flex-wrap gap-2 mb-8">
                        {categories.map((category) => (
                            <button
                                key={category}
                                onClick={() => setSelectedCategory(category)}
                                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${selectedCategory === category
                                    ? 'bg-teal-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                                style={{ fontFamily: 'Inter, sans-serif' }}
                            >
                                {category}
                            </button>
                        ))}
                    </div>

                    {/* Articles Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredArticles.map((article) => (
                            <div
                                key={article._id}
                                className="bg-white rounded-xl overflow-hidden cursor-pointer hover:shadow-lg transition-all border border-gray-200"
                                onClick={() => navigate(`/resources/articles/${article.slug}`)}
                            >
                                {article.image ? (
                                    <img
                                        src={article.image}
                                        alt={article.title}
                                        className="w-full h-48 object-cover"
                                    />
                                ) : (
                                    <div className="h-48 bg-gradient-to-br from-purple-100 to-pink-100"></div>
                                )}
                                <div className="p-5">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                                            {article.category}
                                        </span>
                                        <span className="text-xs text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
                                            {article.readTime}
                                        </span>
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                                        {article.title}
                                    </h3>
                                    <p className="text-sm text-gray-600 line-clamp-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                                        {article.description}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* CTA Sidebar - Fixed on right */}
                <div className="fixed right-8 top-1/4 w-80 bg-white rounded-xl p-6 shadow-lg border border-gray-200 hidden xl:block">
                    <h3 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Bree Serif, serif' }}>
                        Consult a Professional
                    </h3>
                    <p className="text-sm text-gray-600 mb-6" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Connect with expert therapists and psychiatrists to support your mental health journey
                    </p>
                    <button
                        onClick={() => navigate('/choose-professional')}
                        className="w-full px-6 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                        CONSULT NOW
                    </button>

                    <div className="mt-8 pt-8 border-t border-gray-200">
                        <h4 className="text-lg font-bold text-gray-900 mb-3" style={{ fontFamily: 'Bree Serif, serif' }}>
                            Thoroughly Vetted Content
                        </h4>
                        <p className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                            All our resources are reviewed by licensed mental health professionals to ensure accuracy and quality.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ArticlesPage;
