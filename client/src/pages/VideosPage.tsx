import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { videos, videoCategories } from '../data/videos';

const VideosPage: React.FC = () => {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');

    const filteredVideos = videos.filter(video => {
        const matchesSearch = video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            video.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = selectedCategory === 'All' || video.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

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
                        <span className="text-gray-900 font-medium">Videos</span>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 py-12">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-4xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Bree Serif, serif' }}>
                            Mental Health Videos
                        </h1>
                        <p className="text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Expert insights and guidance on mental health topics
                        </p>
                    </div>
                    <div className="relative w-80">
                        <input
                            type="text"
                            placeholder="Search videos"
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
                    {videoCategories.map((category) => (
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

                {/* Videos Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredVideos.map((video) => (
                        <div
                            key={video.id}
                            className="bg-white rounded-xl overflow-hidden hover:shadow-lg transition-all border border-gray-200"
                        >
                            {/* Video Thumbnail with YouTube Embed */}
                            <div className="relative aspect-video bg-black">
                                <iframe
                                    src={`https://www.youtube.com/embed/${video.youtubeId}`}
                                    title={video.title}
                                    frameBorder="0"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                    className="w-full h-full"
                                />
                            </div>

                            {/* Video Info */}
                            <div className="p-5">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                                        {video.category}
                                    </span>
                                    <span className="text-xs text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
                                        {video.duration}
                                    </span>
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    {video.title}
                                </h3>
                                <p className="text-sm text-gray-600 line-clamp-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    {video.description}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Empty State */}
                {filteredVideos.length === 0 && (
                    <div className="text-center py-16">
                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Bree Serif, serif' }}>
                            No videos found
                        </h3>
                        <p className="text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Try adjusting your search or filter
                        </p>
                    </div>
                )}

                {/* CTA Section */}
                <div className="bg-gradient-to-r from-teal-600 to-cyan-600 rounded-xl p-10 text-center text-white mt-16">
                    <h2 className="text-3xl font-bold mb-4" style={{ fontFamily: 'Bree Serif, serif' }}>
                        Ready to Take the Next Step?
                    </h2>
                    <p className="text-lg mb-8 max-w-2xl mx-auto" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Connect with qualified mental health professionals for personalized support
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
        </div>
    );
};

export default VideosPage;
