import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Video, ArrowRight, Home } from 'lucide-react';
import { motion } from 'framer-motion';
import LeafDecor from '../components/ui/LeafDecor';

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: 'easeOut' }
} as any;

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

const ResourcesPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Background Decor */}
      <LeafDecor className="absolute -top-20 -left-20 text-teal-900/5 rotate-45 transform scale-150" />
      <LeafDecor className="absolute top-1/2 -right-32 text-teal-900/5 -rotate-90 transform scale-[2]" />
      
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[var(--teal-glow)] rounded-full mix-blend-multiply filter blur-[80px] opacity-70 transform translate-x-1/2 -translate-y-1/2 z-0" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-[var(--teal-glow)] rounded-full mix-blend-multiply filter blur-[100px] opacity-50 transform -translate-x-1/3 translate-y-1/3 z-0" />

      {/* Main Content Area */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        
        {/* Navigation */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="mb-12 flex items-center gap-3 text-xs font-medium font-sans"
        >
          <button 
            onClick={() => navigate('/')} 
            className="flex items-center gap-1.5 px-4 py-2 rounded-full border bg-white/50 hover:bg-white transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            <Home size={14} /> Home
          </button>
          <span style={{ color: 'var(--border-strong)' }}>/</span>
          <span className="px-4 py-2 rounded-full border bg-white/50" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
            Resources
          </span>
        </motion.div>

        {/* Editorial Header */}
        <motion.div 
          {...fadeUp}
          className="mb-16"
        >
          <h1 
            className="text-4xl md:text-6xl font-medium mb-6 tracking-tight" 
            style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}
          >
            Wellness Resources
          </h1>
          <p 
            className="text-base md:text-lg max-w-2xl font-sans leading-relaxed" 
            style={{ color: 'var(--text-2)' }}
          >
            Explore our collection of clinically vetted resources designed to support your mental health journey.
          </p>
        </motion.div>

        {/* Featured / All Resources Grid */}
        <motion.div 
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16"
        >
          
          {/* Articles Hub */}
          <motion.div 
            variants={fadeUp}
            onClick={() => navigate('/resources/articles')}
            className="p-8 lg:p-10 rounded-[40px] relative overflow-hidden group cursor-pointer"
            style={{ 
              background: 'rgba(255, 255, 255, 0.7)', 
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.8)',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--teal-glow)] rounded-full mix-blend-multiply filter blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 transform translate-x-1/2 -translate-y-1/2" />
            
            <div className="flex flex-col h-full justify-between relative z-10">
              <div>
                <div className="w-14 h-14 rounded-3xl flex items-center justify-center mb-8 bg-white shadow-sm border" style={{ borderColor: 'var(--border)' }}>
                  <BookOpen className="w-6 h-6" style={{ color: 'var(--teal)' }} />
                </div>
                <h2 className="text-2xl font-medium mb-3" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
                  Read Articles
                </h2>
                <p className="text-sm font-sans leading-relaxed mb-10" style={{ color: 'var(--text-2)' }}>
                  Deep dive into topics like anxiety, depression, and relationship counseling with our expert-written blogs.
                </p>
              </div>
              <div 
                className="flex items-center text-sm font-semibold tracking-wide uppercase transition-all group-hover:gap-2"
                style={{ color: 'var(--teal-dark)', fontFamily: 'var(--font-sans)' }}
              >
                Browse Articles
                <ArrowRight size={16} className="ml-1" />
              </div>
            </div>
          </motion.div>

          {/* Videos Hub */}
          <motion.div 
            variants={fadeUp}
            onClick={() => navigate('/resources/videos')}
            className="p-8 lg:p-10 rounded-[40px] relative overflow-hidden group cursor-pointer"
            style={{ 
              background: 'rgba(255, 255, 255, 0.7)', 
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.8)',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--teal-glow)] rounded-full mix-blend-multiply filter blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 transform translate-x-1/2 -translate-y-1/2" />
            
            <div className="flex flex-col h-full justify-between relative z-10">
              <div>
                <div className="w-14 h-14 rounded-3xl flex items-center justify-center mb-8 bg-white shadow-sm border" style={{ borderColor: 'var(--border)' }}>
                  <Video className="w-6 h-6" style={{ color: 'var(--sage)' }} />
                </div>
                <h2 className="text-2xl font-medium mb-3" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
                  Watch Videos
                </h2>
                <p className="text-sm font-sans leading-relaxed mb-10" style={{ color: 'var(--text-2)' }}>
                  Watch educational videos, webinars, and interviews with mental health professionals.
                </p>
              </div>
              <div 
                className="flex items-center text-sm font-semibold tracking-wide uppercase transition-all group-hover:gap-2"
                style={{ color: 'var(--sage)', fontFamily: 'var(--font-sans)' }}
              >
                Browse Videos
                <ArrowRight size={16} className="ml-1" />
              </div>
            </div>
          </motion.div>

        </motion.div>

        {/* CTA Section */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
          className="rounded-[40px] p-12 text-center relative overflow-hidden border shadow-sm"
          style={{ background: 'var(--bg-2)', borderColor: 'var(--border)' }}
        >
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/60 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-teal-500/5 rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2" />
          </div>

          <div className="relative z-10 max-w-2xl mx-auto">
            <h2 className="text-3xl font-medium mb-4" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              Need Professional Support?
            </h2>
            <p className="text-base font-sans leading-relaxed mb-8" style={{ color: 'var(--text-2)' }}>
              Resources are a great start, but they don't replace professional care. Connect with qualified therapists who can provide personalized guidance.
            </p>
            <button
              onClick={() => navigate('/choose-professional')}
              className="px-8 py-4 bg-[var(--teal)] hover:opacity-90 text-white font-medium rounded-full transition-all inline-flex items-center gap-2"
            >
              Find a Therapist
              <ArrowRight size={16} />
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default ResourcesPage;
