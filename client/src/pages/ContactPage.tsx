import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FiUser, FiMail, FiMessageSquare, FiPhone, FiMapPin, FiSend, FiArrowLeft } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import LeafDecor from '../components/ui/LeafDecor';

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: 'easeOut' }
} as any;

export default function ContactPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !message) {
      toast.error('Please fill in all required fields');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      toast.success('Thank you! Your message has been sent successfully.');
      setName('');
      setEmail('');
      setSubject('');
      setMessage('');
      setLoading(false);
    }, 1000);
  };

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
          className="mb-12 flex items-center justify-between"
        >
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border bg-white/50 hover:bg-white transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
          >
            <FiArrowLeft size={14} /> 
            <span className="text-xs font-semibold uppercase tracking-widest">Return</span>
          </button>
        </motion.div>

        {/* Editorial Header */}
        <motion.div 
          {...fadeUp}
          className="text-center mb-16"
        >
          <h1 
            className="text-4xl md:text-6xl font-medium mb-6 tracking-tight" 
            style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}
          >
            Get in Touch
          </h1>
          <p 
            className="text-base md:text-lg max-w-2xl mx-auto font-sans leading-relaxed" 
            style={{ color: 'var(--text-2)' }}
          >
            Have questions about session bookings, our therapists, or mental health support? Reach out and we'll help.
          </p>
        </motion.div>

        {/* Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          
          {/* Contact Info (Left) */}
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }}
            className="lg:col-span-5 p-10 rounded-[40px] relative overflow-hidden group h-full flex flex-col justify-between"
            style={{ 
              background: 'var(--dark-bg)', 
              color: 'var(--dark-text)'
            }}
          >
            {/* Ambient Dark Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/20 rounded-full mix-blend-screen filter blur-[80px] opacity-50 transform translate-x-1/2 -translate-y-1/2" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/10 rounded-full mix-blend-screen filter blur-[80px] opacity-30 transform -translate-x-1/2 translate-y-1/2" />

            <div className="relative z-10 space-y-10">
              <div>
                <h2 className="text-2xl font-medium mb-2" style={{ fontFamily: 'var(--font-display)' }}>Support Center</h2>
                <p className="text-sm opacity-60 font-sans leading-relaxed">
                  Our dedicated care team is here to support your mental wellness journey.
                </p>
              </div>

              <div className="space-y-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10">
                    <FiPhone className="text-teal-400" size={20} />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-widest opacity-50 font-sans mb-1">Call Us</p>
                    <p className="font-medium font-sans tracking-wide">+91 98765 43210</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10">
                    <FiMail className="text-teal-400" size={20} />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-widest opacity-50 font-sans mb-1">Email Support</p>
                    <p className="font-medium font-sans tracking-wide">support@veraawell.com</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 flex-shrink-0">
                    <FiMapPin className="text-teal-400" size={20} />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-widest opacity-50 font-sans mb-1">Our Office</p>
                    <div className="font-medium font-sans tracking-wide text-sm leading-relaxed space-y-1">
                      <p>Okhla Industrial Estate, Phase III</p>
                      <p>Near Govind Puri Metro Station</p>
                      <p className="opacity-70 text-xs mt-1">Shyam Nagar, New Delhi, Delhi 110020</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative z-10 pt-10 mt-10 border-t border-white/10 text-xs opacity-50 font-sans leading-relaxed">
              Veraawell Support Team is available<br/>Monday to Saturday, 9:00 AM to 6:00 PM.
            </div>
          </motion.div>

          {/* Form (Right) */}
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
            className="lg:col-span-7 bg-white/60 backdrop-blur-3xl rounded-[40px] p-10 lg:p-12 border shadow-sm relative"
            style={{ borderColor: 'rgba(255,255,255,0.8)' }}
          >
            <div className="mb-8">
              <h2 className="text-2xl font-medium" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Send a Message</h2>
              <p className="text-sm mt-2 font-sans" style={{ color: 'var(--text-2)' }}>We typically reply within a few hours.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Name */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold tracking-wider uppercase font-sans" style={{ color: 'var(--text-3)' }}>Full Name *</label>
                  <div className="relative group">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors pointer-events-none" style={{ color: 'var(--text-3)' }}>
                      <FiUser size={16} />
                    </span>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Doe"
                      className="w-full pl-12 pr-4 py-3.5 bg-white/50 border rounded-2xl text-sm transition-all font-sans focus:outline-none"
                      style={{ 
                        borderColor: 'var(--border)', 
                        color: 'var(--text)',
                      }}
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold tracking-wider uppercase font-sans" style={{ color: 'var(--text-3)' }}>Email Address *</label>
                  <div className="relative group">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors pointer-events-none" style={{ color: 'var(--text-3)' }}>
                      <FiMail size={16} />
                    </span>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="jane@example.com"
                      className="w-full pl-12 pr-4 py-3.5 bg-white/50 border rounded-2xl text-sm transition-all font-sans focus:outline-none"
                      style={{ 
                        borderColor: 'var(--border)', 
                        color: 'var(--text)',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Subject */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold tracking-wider uppercase font-sans" style={{ color: 'var(--text-3)' }}>Subject</label>
                <div className="relative group">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors pointer-events-none" style={{ color: 'var(--text-3)' }}>
                    <FiMessageSquare size={16} />
                  </span>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="What is this regarding?"
                    className="w-full pl-12 pr-4 py-3.5 bg-white/50 border rounded-2xl text-sm transition-all font-sans focus:outline-none"
                    style={{ 
                      borderColor: 'var(--border)', 
                      color: 'var(--text)',
                    }}
                  />
                </div>
              </div>

              {/* Message */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold tracking-wider uppercase font-sans" style={{ color: 'var(--text-3)' }}>Message *</label>
                <textarea
                  required
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="How can we help you?"
                  className="w-full p-4 bg-white/50 border rounded-2xl text-sm transition-all font-sans focus:outline-none resize-none"
                  style={{ 
                    borderColor: 'var(--border)', 
                    color: 'var(--text)',
                  }}
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 rounded-2xl text-white font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity mt-4 disabled:opacity-50"
                style={{ background: 'var(--teal)' }}
              >
                {loading ? 'Sending Message...' : (
                  <>
                    <FiSend size={16} /> Send Message
                  </>
                )}
              </button>

            </form>
          </motion.div>

        </div>
      </div>
    </div>
  );
}
