import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiClock, FiAlertCircle, FiCheckCircle } from 'react-icons/fi';
import { motion } from 'framer-motion';
import LeafDecor from '../components/ui/LeafDecor';

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
};

export default function RefundPolicyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Background Decor */}
      <LeafDecor className="absolute -top-20 -left-20 text-teal-900/5 rotate-45 transform scale-150" />
      <LeafDecor className="absolute top-1/2 -right-32 text-teal-900/5 -rotate-90 transform scale-[2]" />
      
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[var(--teal-glow)] rounded-full mix-blend-multiply filter blur-[80px] opacity-70 transform translate-x-1/2 -translate-y-1/2 z-0" />
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
              Updated: July 2026
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
            Cancellation & Refund Policy
          </h1>
          <p 
            className="text-base md:text-lg max-w-2xl mx-auto font-sans leading-relaxed" 
            style={{ color: 'var(--text-2)' }}
          >
            Clear and transparent guidelines for session cancellations, no-shows, and refund processing on Veraawell. No hidden clauses.
          </p>
        </motion.div>

        {/* Highlight Cards (Glassmorphism) */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
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
            <FiClock style={{ color: 'var(--teal)' }} size={24} className="mb-4" />
            <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>4-Hour Notice</h3>
            <p className="text-sm leading-relaxed font-sans" style={{ color: 'var(--text-2)' }}>
              Cancellations made at least 4 hours before your session start time are eligible for a 100% full refund, no questions asked.
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
            <FiCheckCircle style={{ color: 'var(--sage)' }} size={24} className="mb-4" />
            <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Instant Processing</h3>
            <p className="text-sm leading-relaxed font-sans" style={{ color: 'var(--text-2)' }}>
              Approved refunds are triggered instantly by our systems and reflect in your original payment method within 5-7 business days.
            </p>
          </div>
        </motion.div>

        {/* Typography-led Content */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="bg-white/40 backdrop-blur-3xl rounded-[40px] p-8 md:p-16 border border-white/60 shadow-sm space-y-12"
        >
          <section className="space-y-4">
            <h2 className="text-2xl font-medium" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              1. Patient Cancellations
            </h2>
            <div className="space-y-4 text-base leading-relaxed font-sans" style={{ color: 'var(--text-2)' }}>
              <p>We understand that life happens and plans can change. To request a cancellation and refund for a booked consultation:</p>
              <ul className="list-none space-y-3 pl-2">
                <li className="flex items-start gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--teal)] flex-shrink-0" />
                  <span><strong>Prior to 4 Hours:</strong> You may cancel or reschedule your appointment without any penalty up to 4 hours before the scheduled start time. A full refund will be automatically initiated.</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--warm)] flex-shrink-0" />
                  <span><strong>Within 4 Hours:</strong> Cancellations made less than 4 hours prior to the session start time are strictly non-refundable, as the therapist's time has been exclusively reserved for you and cannot be rebooked.</span>
                </li>
              </ul>
            </div>
          </section>

          <div className="w-full h-px bg-gradient-to-r from-transparent via-[var(--border-strong)] to-transparent opacity-30" />

          <section className="space-y-4">
            <h2 className="text-2xl font-medium flex items-center gap-3" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              2. No-Show Policy
              <span className="px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase bg-[var(--bg-2)] text-[var(--teal-dark)] font-sans mt-1">Strict</span>
            </h2>
            <div className="space-y-4 text-base leading-relaxed font-sans" style={{ color: 'var(--text-2)' }}>
              <p>
                If a patient fails to join the video consultation room within the first 10 minutes of the scheduled session time, the system will mark it as a <strong>"Patient No-Show"</strong>. Patient no-shows are completely non-refundable.
              </p>
              <p>
                Conversely, if the therapist fails to join the room within the first 10 minutes, it will be marked as a <strong>"Doctor No-Show"</strong>. In this highly rare event, you will receive an automatic 100% full refund, and our support team will immediately reach out to assist you in rescheduling if desired.
              </p>
            </div>
          </section>

          <div className="w-full h-px bg-gradient-to-r from-transparent via-[var(--border-strong)] to-transparent opacity-30" />

          <section className="space-y-4">
            <h2 className="text-2xl font-medium" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              3. Processing of Refunds
            </h2>
            <div className="space-y-4 text-base leading-relaxed font-sans" style={{ color: 'var(--text-2)' }}>
              <p>All eligible refunds are initiated directly back to the original source of payment (Credit Card, Debit Card, UPI, or Net Banking).</p>
              <ul className="list-none space-y-3 pl-2">
                <li className="flex items-start gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--sage)] flex-shrink-0" />
                  <span>Once initiated by Veraawell, the payment gateway typically takes <strong>5 to 7 business days</strong> to credit the amount back to your account, depending on your bank.</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--sage)] flex-shrink-0" />
                  <span>In the case of technical failures during checkout (where money is debited but the session is not booked), our system triggers an automatic refund instantly.</span>
                </li>
              </ul>
            </div>
          </section>
          
          <div className="w-full h-px bg-gradient-to-r from-transparent via-[var(--border-strong)] to-transparent opacity-30" />

          <section className="space-y-4">
            <h2 className="text-2xl font-medium" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              4. Exceptional Circumstances
            </h2>
            <p className="text-base leading-relaxed font-sans" style={{ color: 'var(--text-2)' }}>
              If you experienced a severe technical issue on our platform (e.g., video failing to connect due to our servers) that prevented the consultation from occurring, please reach out to our support team within 24 hours of the appointment time. We will investigate the logs and process a manual refund or free reschedule upon verification.
            </p>
          </section>

          {/* Contact CTA */}
          <div className="mt-12 p-8 rounded-3xl bg-[var(--dark-bg)] text-center">
            <p className="text-[var(--dark-text-2)] font-sans mb-4">Have questions about a specific charge?</p>
            <a 
              href="mailto:support@veraawell.com" 
              className="inline-flex items-center justify-center px-6 py-3 rounded-full font-medium transition-colors"
              style={{ background: 'var(--teal)', color: 'white' }}
            >
              Contact Billing Support
            </a>
          </div>

        </motion.div>
      </div>
    </div>
  );
}
