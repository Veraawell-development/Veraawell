import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Video, ArrowRight, Home } from 'lucide-react';

const ResourcesPage: React.FC = () => {
  const navigate = useNavigate();

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
            <span className="text-neutral-900">Resources</span>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="bg-white">
        <div className="max-w-7xl mx-auto px-4 py-16 text-center md:text-left">
          <h1 className="text-4xl md:text-5xl font-bold text-neutral-900 mb-4 font-serif" style={{ fontFamily: 'Bree Serif, serif' }}>
            Wellness Resources
          </h1>
          <p className="text-sm md:text-base text-neutral-500 max-w-2xl font-medium">
            Explore our collection of clinically vetted resources designed to support your mental health journey.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        
        {/* Featured / All Resources Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          
          {/* Articles Hub */}
          <div 
            onClick={() => navigate('/resources/articles')}
            className="bg-white rounded-2xl p-8 border border-neutral-100 shadow-sm hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="flex flex-col h-full justify-between">
              <div>
                <div className="w-12 h-12 bg-[#fff3db] rounded-xl flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                  <BookOpen className="w-6 h-6 text-[#0097b2]" />
                </div>
                <h2 className="text-xl font-bold text-neutral-900 mb-2 font-serif" style={{ fontFamily: 'Bree Serif, serif' }}>
                  Read Articles
                </h2>
                <p className="text-xs text-neutral-500 font-medium leading-relaxed">
                  Deep dive into topics like anxiety, depression, and relationship counseling with our expert-written blogs.
                </p>
              </div>
              <div className="mt-6 flex items-center text-xs font-bold text-[#0097b2] group-hover:gap-2 transition-all">
                Browse Articles
                <ArrowRight size={14} className="ml-1" />
              </div>
            </div>
          </div>

          {/* Videos Hub */}
          <div 
            onClick={() => navigate('/resources/videos')}
            className="bg-white rounded-2xl p-8 border border-neutral-100 shadow-sm hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="flex flex-col h-full justify-between">
              <div>
                <div className="w-12 h-12 bg-[#fff3db] rounded-xl flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                  <Video className="w-6 h-6 text-[#0097b2]" />
                </div>
                <h2 className="text-xl font-bold text-neutral-900 mb-2 font-serif" style={{ fontFamily: 'Bree Serif, serif' }}>
                  Watch Videos
                </h2>
                <p className="text-xs text-neutral-500 font-medium leading-relaxed">
                  Watch educational videos, webinars, and interviews with mental health professionals.
                </p>
              </div>
              <div className="mt-6 flex items-center text-xs font-bold text-[#0097b2] group-hover:gap-2 transition-all">
                Browse Videos
                <ArrowRight size={14} className="ml-1" />
              </div>
            </div>
          </div>

        </div>

        {/* CTA Section */}
        <div className="bg-[#fff3db] rounded-2xl p-10 text-center border border-neutral-100">
          <h2 className="text-2xl font-bold text-neutral-900 mb-2 font-serif" style={{ fontFamily: 'Bree Serif, serif' }}>
            Need Professional Support?
          </h2>
          <p className="text-xs text-neutral-600 mb-6 max-w-2xl mx-auto font-medium">
            Resources are a great start, but they don't replace professional care. Connect with qualified therapists who can provide personalized guidance.
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

export default ResourcesPage;
