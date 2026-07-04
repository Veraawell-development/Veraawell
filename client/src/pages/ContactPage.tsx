import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FiUser, FiMail, FiMessageSquare, FiPhone, FiMapPin, FiSend } from 'react-icons/fi';
import toast from 'react-hot-toast';

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeInOut' } }
} as any;

export default function ContactPage() {
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
    <div className="min-h-screen bg-[#fcfbfa] flex items-center justify-center py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl w-full flex flex-col md:flex-row gap-8 bg-white border border-neutral-200/80 shadow-sm rounded-3xl overflow-hidden p-6 sm:p-10">
        
        {/* Contact Info Panel */}
        <div className="w-full md:w-5/12 bg-[#002b34] text-[#fff3db] rounded-2xl p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden">
          {/* Ambient Glow */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="w-48 h-48 rounded-full blur-3xl absolute -bottom-10 -right-10" style={{ background: 'radial-gradient(circle, rgba(20,184,166,0.15) 0%, transparent 65%)' }} />
          </div>

          <div className="relative z-10 space-y-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold font-sans tracking-tight mb-2">Get in Touch</h2>
              <p className="text-xs text-white/60 leading-relaxed font-sans">
                Have questions about session bookings, our therapists, or mental health support? Reach out and we'll help.
              </p>
            </div>

            <div className="space-y-4 pt-4">
              <div className="flex items-center gap-3">
                <FiPhone className="text-[#0097b2] flex-shrink-0" size={16} />
                <div className="text-xs font-sans">
                  <p className="text-white/40">Call Us</p>
                  <p className="font-semibold text-white/90">+91 98765 43210</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <FiMail className="text-[#0097b2] flex-shrink-0" size={16} />
                <div className="text-xs font-sans">
                  <p className="text-white/40">Email Support</p>
                  <p className="font-semibold text-white/90">support@veraawell.com</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <FiMapPin className="text-[#0097b2] flex-shrink-0" size={16} />
                <div className="text-xs font-sans">
                  <p className="text-white/40">Our Office</p>
                  <p className="font-semibold text-white/90">New Delhi, India</p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 pt-8 border-t border-white/10 text-[10px] text-white/40 font-sans mt-8 md:mt-0">
            Veraawell Support Team is available Monday to Saturday, 9:00 AM to 6:00 PM.
          </div>
        </div>

        {/* Contact Form Panel */}
        <div className="flex-1">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-neutral-900 font-sans">Send a Message</h1>
            <p className="text-xs text-neutral-400 mt-1 font-sans">We'll get back to you within 24 hours.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <motion.div variants={fadeUp} initial="initial" animate="animate" className="space-y-1">
              <label className="block text-[11px] font-medium text-neutral-400 tracking-wide font-sans">FULL NAME *</label>
              <div className="relative group">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-neutral-600 transition-colors pointer-events-none text-[13px]">
                  <FiUser size={13} />
                </span>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-[13px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/8 focus:border-neutral-400 hover:border-neutral-300 transition-all font-sans"
                />
              </div>
            </motion.div>

            <motion.div variants={fadeUp} initial="initial" animate="animate" className="space-y-1">
              <label className="block text-[11px] font-medium text-neutral-400 tracking-wide font-sans">EMAIL ADDRESS *</label>
              <div className="relative group">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-neutral-600 transition-colors pointer-events-none text-[13px]">
                  <FiMail size={13} />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-[13px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/8 focus:border-neutral-400 hover:border-neutral-300 transition-all font-sans"
                />
              </div>
            </motion.div>

            <motion.div variants={fadeUp} initial="initial" animate="animate" className="space-y-1">
              <label className="block text-[11px] font-medium text-neutral-400 tracking-wide font-sans">SUBJECT</label>
              <div className="relative group">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-neutral-600 transition-colors pointer-events-none text-[13px]">
                  <FiMessageSquare size={13} />
                </span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="What is this regarding?"
                  className="w-full pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-[13px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/8 focus:border-neutral-400 hover:border-neutral-300 transition-all font-sans"
                />
              </div>
            </motion.div>

            <motion.div variants={fadeUp} initial="initial" animate="animate" className="space-y-1">
              <label className="block text-[11px] font-medium text-neutral-400 tracking-wide font-sans">MESSAGE *</label>
              <textarea
                required
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your message here..."
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-[13px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/8 focus:border-neutral-400 hover:border-neutral-300 transition-all resize-none font-sans"
              />
            </motion.div>

            <motion.button
              variants={fadeUp}
              initial="initial"
              animate="animate"
              type="submit"
              disabled={loading}
              whileTap={{ scale: 0.98 }}
              className="w-full flex items-center justify-center gap-2 py-2 bg-[#0097b2] hover:bg-[#007c93] text-white text-xs font-semibold rounded-xl transition-all disabled:opacity-50 shadow-sm font-sans mt-2"
            >
              <FiSend size={13} />
              {loading ? 'Sending...' : 'Send Message'}
            </motion.button>
          </form>
        </div>
      </div>
    </div>
  );
}
