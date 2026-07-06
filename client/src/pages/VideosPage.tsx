import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { videos, videoCategories } from '../data/videos';
import { Search, ArrowRight, Clock, Video } from 'lucide-react';
import SparkDecor from '../components/ui/SparkDecor';
// import removed

const VideosPage: React.FC = () => {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [playingVideos, setPlayingVideos] = useState<string[]>([]);

    const filteredVideos = videos.filter(video => {
        const matchesSearch = video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            video.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = selectedCategory === 'All' || video.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

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
                        Curated Talks
                    </h1>
                    <p className="text-[18px] md:text-[20px] text-[var(--text-2)] max-w-2xl leading-relaxed mb-10" style={{ fontFamily: 'var(--font-body)' }}>
                        Deep insights and profound talks from world-renowned psychologists and mental health experts.
                    </p>

                    {/* Premium Search */}
                    <div className="relative w-full max-w-xl group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-[var(--teal-muted)] to-[var(--coral-muted)] rounded-[32px] blur opacity-25 group-hover:opacity-40 transition duration-500"></div>
                        <div className="relative flex items-center bg-[var(--surface)] border border-[var(--border)] rounded-[32px] px-6 py-4 shadow-sm focus-within:border-[var(--teal)] transition-colors">
                            <Search className="w-5 h-5 text-[var(--text-3)]" />
                            <input
                                type="text"
                                placeholder="Search by topic, speaker, or keyword..."
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
                <div className="flex flex-wrap items-center justify-center gap-3 mb-16">
                    {videoCategories.map((cat) => (
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
                </div>

                {/* ── Videos Grid ── */}
                <div>
                    <div className="flex items-center gap-4 mb-10">
                        <span className="text-[12px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                            {searchQuery ? `Results for "${searchQuery}"` : selectedCategory === 'All' ? 'All Videos' : selectedCategory}
                        </span>
                        <div className="flex-1 h-px bg-[var(--border)]" />
                        <span className="text-[12px] font-bold text-[var(--text-3)]">{filteredVideos.length} found</span>
                    </div>

                    {filteredVideos.length === 0 ? (
                        <div className="text-center py-32 bg-[var(--surface)] rounded-[32px] border border-[var(--border)]">
                            <div className="w-16 h-16 bg-[var(--teal-muted)] rounded-full flex items-center justify-center mx-auto mb-6">
                                <Video className="w-8 h-8 text-[var(--teal)]" />
                            </div>
                            <h3 className="text-[24px] font-bold text-[var(--text)] mb-3" style={{ fontFamily: 'var(--font-display)' }}>No videos found</h3>
                            <p className="text-[16px] text-[var(--text-2)]">Try adjusting your search or selecting a different category.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {filteredVideos.map((video, index) => (
                                <div 
                                    key={video.id}
                                    style={{ transitionDelay: `${index * 100}ms` }}
                                    className="group bg-[var(--surface)] rounded-[32px] overflow-hidden border border-[var(--border)] shadow-sm hover:shadow-xl hover:-translate-y-2 transition-all duration-500 flex flex-col"
                                >
                                    {/* Video Player Frame */}
                                    <div className="relative aspect-video bg-black overflow-hidden group-hover:shadow-inner">
                                        {!playingVideos.includes(video.id) ? (
                                            <div 
                                                className="absolute inset-0 cursor-pointer group/player"
                                                onClick={() => setPlayingVideos(prev => [...prev, video.id])}
                                            >
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent z-10 pointer-events-none"></div>
                                                <img 
                                                    src={video.thumbnail} 
                                                    alt={video.title} 
                                                    className="absolute inset-0 w-full h-full object-cover scale-[1.01] group-hover/player:scale-[1.05] transition-transform duration-700 ease-out"
                                                />
                                                {/* Custom Play Button */}
                                                <div className="absolute inset-0 z-20 flex items-center justify-center">
                                                    <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/30 group-hover/player:bg-[var(--teal)] transition-colors duration-300 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
                                                        <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                                                            <path d="M8 5v14l11-7z"/>
                                                        </svg>
                                                    </div>
                                                </div>
                                                <div className="absolute top-4 left-4 z-20">
                                                    <span className="px-3 py-1 bg-black/50 backdrop-blur-md text-white text-[11px] font-bold tracking-wider uppercase rounded-full border border-white/10">
                                                        {video.category}
                                                    </span>
                                                </div>
                                            </div>
                                        ) : (
                                            <iframe
                                                src={`https://www.youtube.com/embed/${video.youtubeId}?autoplay=1`}
                                                title={video.title}
                                                frameBorder="0"
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                allowFullScreen
                                                className="absolute inset-0 w-full h-full scale-[1.01]"
                                            />
                                        )}
                                    </div>

                                    {/* Video Info */}
                                    <div className="p-8 flex flex-col flex-1 relative">
                                        <div className="absolute top-0 right-8 w-24 h-24 bg-[var(--teal-muted)] rounded-full filter blur-2xl opacity-0 group-hover:opacity-20 transition-opacity pointer-events-none"></div>
                                        
                                        <h3 className="text-[20px] font-bold text-[var(--text)] mb-3 leading-snug group-hover:text-[var(--teal)] transition-colors" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
                                            {video.title}
                                        </h3>
                                        <p className="text-[14px] text-[var(--text-2)] leading-relaxed mb-8 line-clamp-3">
                                            {video.description}
                                        </p>
                                        
                                        <div className="flex items-center justify-between mt-auto pt-4 border-t border-[var(--border)]">
                                            <div className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-3)]">
                                                <Clock size={14} />
                                                <span>{video.duration}</span>
                                            </div>
                                            <span 
                                                onClick={() => !playingVideos.includes(video.id) && setPlayingVideos(prev => [...prev, video.id])}
                                                className={`text-[12px] font-bold uppercase tracking-widest ${playingVideos.includes(video.id) ? 'text-[var(--text-3)]' : 'text-[var(--teal)] opacity-0 group-hover:opacity-100 cursor-pointer'} transition-opacity duration-300`} 
                                                style={{ fontFamily: 'var(--font-mono)' }}
                                            >
                                                {playingVideos.includes(video.id) ? 'Playing...' : 'Play Video →'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Bottom CTA Banner ── */}
                <div className="mt-24 relative overflow-hidden bg-[var(--surface)] border border-[var(--border)] rounded-[32px] p-10 md:p-16 flex flex-col md:flex-row items-center justify-between gap-10 shadow-sm">
                    <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-gradient-to-br from-[var(--teal-muted)] to-[var(--coral-muted)] rounded-full mix-blend-multiply filter blur-3xl opacity-30 pointer-events-none"></div>
                    
                    <div className="relative z-10">
                        <h3 className="text-[32px] md:text-[40px] font-bold text-[var(--text)] mb-4" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                            Ready to Take the Next Step?
                        </h3>
                        <p className="text-[var(--text-2)] text-[16px] md:text-[18px] leading-relaxed max-w-xl" style={{ fontFamily: 'var(--font-body)' }}>
                            Connect with qualified mental health professionals for personalized support and a safe space to grow.
                        </p>
                    </div>
                    <button
                        onClick={() => navigate('/choose-professional')}
                        className="relative z-10 flex-shrink-0 bg-[var(--teal)] text-white font-medium text-[16px] px-8 py-4 rounded-full shadow-md hover:shadow-xl hover:-translate-y-1 hover:bg-[var(--teal-dark)] transition-all duration-300 flex items-center gap-2 group"
                    >
                        Find a Therapist 
                        <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VideosPage;
