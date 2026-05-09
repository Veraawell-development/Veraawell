import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { videos, videoCategories } from '../data/videos';
import BackToDashboard from '../components/BackToDashboard';
import { Search, ArrowRight, Clock, Home, Video } from 'lucide-react';

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
                        <span className="text-neutral-900">Videos</span>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 py-12">
                <BackToDashboard className="mb-8" />
                
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-12">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-2 font-serif" style={{ fontFamily: 'Bree Serif, serif' }}>
                            Mental Health Videos
                        </h1>
                        <p className="text-xs text-neutral-500 font-medium">
                            Expert insights and guidance on mental health topics.
                        </p>
                    </div>
                    <div className="relative w-full md:w-80">
                        <input
                            type="text"
                            placeholder="Search videos..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full px-4 py-2.5 pl-10 text-xs rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#0097b2] focus:border-transparent font-medium"
                        />
                        <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                    </div>
                </div>

                {/* Category Tags */}
                <div className="flex flex-wrap gap-2 mb-8">
                    {videoCategories.map((category) => (
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
                </div>

                {/* Videos Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredVideos.map((video) => (
                        <div
                            key={video.id}
                            className="bg-white rounded-2xl overflow-hidden border border-neutral-100 shadow-sm hover:shadow-md transition-all group"
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
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="inline-block px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded-lg text-xs font-medium">
                                        {video.category}
                                    </span>
                                    <div className="flex items-center text-xs text-neutral-400 font-medium">
                                        <Clock size={12} className="mr-1" />
                                        <span>{video.duration}</span>
                                    </div>
                                </div>
                                <h3 className="text-sm font-bold text-neutral-900 mb-2 line-clamp-2 leading-tight">
                                    {video.title}
                                </h3>
                                <p className="text-xs text-neutral-500 line-clamp-2 font-medium">
                                    {video.description}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Empty State */}
                {filteredVideos.length === 0 && (
                    <div className="text-center py-16">
                        <div className="w-16 h-16 bg-[#fff3db] rounded-full flex items-center justify-center mx-auto mb-4">
                            <Video className="w-8 h-8 text-[#0097b2]" />
                        </div>
                        <h3 className="text-lg font-bold text-neutral-900 mb-2 font-serif" style={{ fontFamily: 'Bree Serif, serif' }}>
                            No videos found
                        </h3>
                        <p className="text-xs text-neutral-500 font-medium">
                            Try adjusting your search or filter.
                        </p>
                    </div>
                )}

                {/* CTA Section */}
                <div className="bg-[#fff3db] rounded-2xl p-10 text-center border border-neutral-100 mt-16">
                    <h2 className="text-2xl font-bold text-neutral-900 mb-2 font-serif" style={{ fontFamily: 'Bree Serif, serif' }}>
                        Ready to Take the Next Step?
                    </h2>
                    <p className="text-xs text-neutral-600 mb-6 max-w-2xl mx-auto font-medium leading-relaxed">
                        Connect with qualified mental health professionals for personalized support.
                    </p>
                    <button
                        onClick={() => navigate('/choose-professional')}
                        className="px-6 py-2.5 bg-[#0097b2] hover:bg-[#007c93] text-white text-xs font-semibold rounded-xl transition-colors inline-flex items-center gap-2"
                    >
                        Find a Therapist
                        <ArrowRight size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VideosPage;
