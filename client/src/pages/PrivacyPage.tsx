import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiLock, FiShield, FiUserCheck, FiEye } from 'react-icons/fi';
import { motion } from 'framer-motion';
import LeafDecor from '../components/ui/LeafDecor';

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: 'easeOut' }
} as any;

export default function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Background Decor */}
      <LeafDecor className="absolute -top-20 -left-20 text-teal-900/5 rotate-45 transform scale-150" />
      <LeafDecor className="absolute top-1/2 -right-32 text-teal-900/5 -rotate-90 transform scale-[2]" />
      
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[var(--teal-glow)] rounded-full mix-blend-multiply filter blur-[80px] opacity-70 transform translate-x-1/3 -translate-y-1/3 z-0" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-[var(--teal-glow)] rounded-full mix-blend-multiply filter blur-[100px] opacity-50 transform -translate-x-1/3 translate-y-1/3 z-0" />

      {/* Main Content Area */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        
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
          
          <div className="px-4 py-2 rounded-full border bg-white/50" style={{ borderColor: 'var(--border)' }}>
            <span className="text-[10px] font-bold tracking-wider uppercase font-sans" style={{ color: 'var(--teal-dark)' }}>
              Updated: May 2026
            </span>
          </div>
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
            Privacy Policy
          </h1>
          <p 
            className="text-base md:text-lg max-w-2xl mx-auto font-sans leading-relaxed" 
            style={{ color: 'var(--text-2)' }}
          >
            How we protect, collect, and handle your sensitive medical and personal data at Veraawell.
          </p>
        </motion.div>

        {/* Highlight Cards (Glassmorphism) */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }}
          className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16"
        >
          <div 
            className="p-8 rounded-[32px] relative overflow-hidden group"
            style={{ 
              background: 'rgba(255, 255, 255, 0.7)', 
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.8)',
              boxShadow: 'var(--shadow-md)'
            }}
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--teal-glow)] rounded-full mix-blend-multiply filter blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 transform translate-x-1/2 -translate-y-1/2" />
            <FiShield style={{ color: 'var(--teal)' }} size={24} className="mb-4" />
            <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>End-to-End Privacy</h3>
            <p className="text-sm leading-relaxed font-sans" style={{ color: 'var(--text-2)' }}>
              Your session recordings and therapist conversations are completely secure and confidential.
            </p>
          </div>

          <div 
            className="p-8 rounded-[32px] relative overflow-hidden group"
            style={{ 
              background: 'rgba(255, 255, 255, 0.7)', 
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.8)',
              boxShadow: 'var(--shadow-md)'
            }}
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--teal-glow)] rounded-full mix-blend-multiply filter blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 transform translate-x-1/2 -translate-y-1/2" />
            <FiLock style={{ color: 'var(--sage)' }} size={24} className="mb-4" />
            <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Data Control</h3>
            <p className="text-sm leading-relaxed font-sans" style={{ color: 'var(--text-2)' }}>
              You retain full ownership. You can download, update, or request permanent deletion of your account at any time.
            </p>
          </div>
        </motion.div>

        {/* Typography-led Content */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
          className="bg-white/40 backdrop-blur-3xl rounded-[40px] p-8 md:p-16 border border-white/60 shadow-sm space-y-12"
        >
          <section className="space-y-4">
            <h2 className="text-2xl font-medium" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              1. Information We Collect
            </h2>
            <div className="space-y-4 text-base leading-relaxed font-sans" style={{ color: 'var(--text-2)' }}>
              <p>To provide a personalized therapist experience, we collect specific data when you interact with the platform:</p>
              <ul className="list-none space-y-3 pl-2">
                <li className="flex items-start gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--teal)] flex-shrink-0" />
                  <span><strong>Profile Information:</strong> Full name, email address, phone number, and account password.</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--teal)] flex-shrink-0" />
                  <span><strong>Clinical Notes:</strong> Summary notes, mental health assessments, and treatment recommendation details completed by your assigned doctor.</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--teal)] flex-shrink-0" />
                  <span><strong>Chat & Connection Details:</strong> Real-time messaging history and video session timing metadata. Note that video calls are encrypted peer-to-peer and never recorded.</span>
                </li>
              </ul>
            </div>
          </section>

          <div className="w-full h-px bg-gradient-to-r from-transparent via-[var(--border-strong)] to-transparent opacity-30" />

          <section className="space-y-4">
            <h2 className="text-2xl font-medium flex items-center gap-3" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              2. How We Use Your Data
              <span className="px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase bg-[var(--bg-2)] text-[var(--teal-dark)] font-sans mt-1">Strict</span>
            </h2>
            <div className="space-y-4 text-base leading-relaxed font-sans" style={{ color: 'var(--text-2)' }}>
              <p>We prioritize using your information strictly to coordinate your medical or psychological care:</p>
              <ul className="list-none space-y-3 pl-2">
                <li className="flex items-start gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--sage)] flex-shrink-0" />
                  <span>To match you with licensed psychological professionals matching your service preferences.</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--sage)] flex-shrink-0" />
                  <span>To compile clinical summaries and generate hospital-style post-session reports.</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--sage)] flex-shrink-0" />
                  <span>To secure video and audio communication lines between patients and therapists.</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--warm)] flex-shrink-0" />
                  <span>To prevent fraudulent behavior or server abuse. <strong>We never sell your personal data to marketing companies.</strong></span>
                </li>
              </ul>
            </div>
          </section>

          <div className="w-full h-px bg-gradient-to-r from-transparent via-[var(--border-strong)] to-transparent opacity-30" />

          <section className="space-y-4">
            <h2 className="text-2xl font-medium" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              3. Data Retention & Security
            </h2>
            <p className="text-base leading-relaxed font-sans" style={{ color: 'var(--text-2)' }}>
              We retain your personal information only for as long as necessary to provide our services, comply with legal obligations, resolve disputes, and enforce our agreements. When your information is no longer required, it is securely deleted or anonymized.
            </p>
          </section>
          
          <div className="w-full h-px bg-gradient-to-r from-transparent via-[var(--border-strong)] to-transparent opacity-30" />

          <section className="space-y-4">
            <h2 className="text-2xl font-medium" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              4. Data Deletion & Your Rights
            </h2>
            <p className="text-base leading-relaxed font-sans" style={{ color: 'var(--text-2)' }}>
              Users may request deletion of their account and personal data by contacting us at support@veraawell.com. We will process such requests within a reasonable period, subject to applicable legal and regulatory requirements.
            </p>
          </section>

          <div className="w-full h-px bg-gradient-to-r from-transparent via-[var(--border-strong)] to-transparent opacity-30" />

          <section className="space-y-4">
            <h2 className="text-2xl font-medium" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              5. Payment Information
            </h2>
            <p className="text-base leading-relaxed font-sans" style={{ color: 'var(--text-2)' }}>
              Payments are securely processed through Razorpay. Veraawell does not store users' debit card, credit card, UPI, net banking, or other payment credentials. Payment information is handled by our payment gateway partner in accordance with applicable security standards.
            </p>
          </section>

          <div className="w-full h-px bg-gradient-to-r from-transparent via-[var(--border-strong)] to-transparent opacity-30" />

          <section className="space-y-4">
            <h2 className="text-2xl font-medium" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              6. Cookies Usage
            </h2>
            <p className="text-base leading-relaxed font-sans" style={{ color: 'var(--text-2)' }}>
              We use cookies and similar technologies to improve website functionality, maintain user sessions, analyze website usage, and enhance user experience. You may disable cookies through your browser settings, although some features of the platform may not function properly.
            </p>
          </section>

          {/* Contact CTA */}
          <div className="mt-12 p-8 rounded-3xl bg-[var(--dark-bg)] text-center">
            <p className="text-[var(--dark-text-2)] font-sans mb-4">Would you like to request a data export or account deletion?</p>
            <a 
              href="mailto:privacy@veraawell.com" 
              className="inline-flex items-center justify-center px-6 py-3 rounded-full font-medium transition-colors"
              style={{ background: 'var(--teal)', color: 'white' }}
            >
              Contact Privacy Officer
            </a>
          </div>

        </motion.div>
      </div>
    </div>
  );
}
