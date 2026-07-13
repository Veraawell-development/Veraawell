import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiActivity, FiBriefcase, FiAlertTriangle, FiCheckSquare } from 'react-icons/fi';
import { motion } from 'framer-motion';
import LeafDecor from '../components/ui/LeafDecor';

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: 'easeOut' }
} as any;

export default function TermsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Background Decor */}
      <LeafDecor className="absolute -top-20 -left-20 text-teal-900/5 rotate-45 transform scale-150" />
      <LeafDecor className="absolute top-1/2 -right-32 text-teal-900/5 -rotate-90 transform scale-[2]" />
      
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-[var(--teal-glow)] rounded-full mix-blend-multiply filter blur-[80px] opacity-70 transform -translate-x-1/2 -translate-y-1/2 z-0" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-[var(--teal-glow)] rounded-full mix-blend-multiply filter blur-[100px] opacity-50 transform translate-x-1/3 translate-y-1/3 z-0" />

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
            Terms of Service
          </h1>
          <p 
            className="text-base md:text-lg max-w-2xl mx-auto font-sans leading-relaxed" 
            style={{ color: 'var(--text-2)' }}
          >
            User agreements, platform rules, and critical medical guidelines for utilizing Veraawell safely.
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
            <FiActivity style={{ color: 'var(--teal)' }} size={24} className="mb-4" />
            <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Non-Emergency Service</h3>
            <p className="text-sm leading-relaxed font-sans" style={{ color: 'var(--text-2)' }}>
              Veraawell is NOT a crisis hotline. If you face a medical emergency, visit a local hospital immediately.
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
            <FiBriefcase style={{ color: 'var(--sage)' }} size={24} className="mb-4" />
            <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Licensed Therapists</h3>
            <p className="text-sm leading-relaxed font-sans" style={{ color: 'var(--text-2)' }}>
              All consulting doctors on our platform are licensed professionals strictly verified by regulatory bodies.
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
            <h2 className="text-2xl font-medium flex items-center gap-3" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              1. Acceptance of Terms
            </h2>
            <div className="space-y-4 text-base leading-relaxed font-sans" style={{ color: 'var(--text-2)' }}>
              <p>By accessing the website and utilizing our consultation platform, you agree to comply with and be bound by these Terms of Service. If you disagree with any portion of these guidelines, please stop using our services immediately.</p>
            </div>
          </section>

          <div className="w-full h-px bg-gradient-to-r from-transparent via-[var(--border-strong)] to-transparent opacity-30" />

          <section className="space-y-4">
            <h2 className="text-2xl font-medium flex items-center gap-3" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              2. Clinical Disclaimer
              <span className="px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase bg-[var(--bg-2)] text-[var(--teal-dark)] font-sans mt-1">Important</span>
            </h2>
            <div className="space-y-4 text-base leading-relaxed font-sans" style={{ color: 'var(--text-2)' }}>
              <p>Therapists on the platform offer counseling, behavioral coaching, and psychological assessments. <strong>They do NOT prescribe controlled medical substances.</strong> If your clinical state requires physical checks or drug prescriptions, you should consult an in-person psychiatrist or visit a hospital.</p>
              <p>Veraawell is a teleconsultation platform and does not handle severe medical emergencies. In the event of a medical emergency, please visit the nearest hospital or call emergency services immediately.</p>
            </div>
          </section>

          <div className="w-full h-px bg-gradient-to-r from-transparent via-[var(--border-strong)] to-transparent opacity-30" />

          <section className="space-y-4">
            <h2 className="text-2xl font-medium" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              3. Appointments & Cancellations
            </h2>
            <div className="space-y-4 text-base leading-relaxed font-sans" style={{ color: 'var(--text-2)' }}>
              <p>Session bookings are managed by the patient and are subject to therapist availability.</p>
              <ul className="list-none space-y-3 pl-2">
                <li className="flex items-start gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--teal)] flex-shrink-0" />
                  <span><strong>Free Discovery Sessions:</strong> Eligible users can schedule one free discovery session. Repeated sign-ups for multiple free discovery sessions represent a violation of platform guidelines.</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--warm)] flex-shrink-0" />
                  <span><strong>Cancellation Window:</strong> Scheduled slots may be cancelled or rescheduled up to 4 hours before the session start time without penalty. Cancellations inside 4 hours are non-refundable.</span>
                </li>
              </ul>
            </div>
          </section>
          
          <div className="w-full h-px bg-gradient-to-r from-transparent via-[var(--border-strong)] to-transparent opacity-30" />

          <section className="space-y-4">
            <h2 className="text-2xl font-medium" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              4. Code of Conduct
            </h2>
            <p className="text-base leading-relaxed font-sans" style={{ color: 'var(--text-2)' }}>
              Veraawell enforces a strict policy against harassment, abuse, or inappropriate behavior towards our consulting doctors. We reserve the absolute right to suspend or terminate accounts that exhibit abusive or unlawful behavior.
            </p>
          </section>
          <div className="w-full h-px bg-gradient-to-r from-transparent via-[var(--border-strong)] to-transparent opacity-30" />

          <section className="space-y-4">
            <h2 className="text-2xl font-medium" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              5. Governing Law
            </h2>
            <p className="text-base leading-relaxed font-sans" style={{ color: 'var(--text-2)' }}>
              These Terms shall be governed by and construed in accordance with the laws of India. Any disputes arising out of or relating to these Terms shall be subject to the exclusive jurisdiction of the courts of New Delhi, India.
            </p>
          </section>

          <div className="w-full h-px bg-gradient-to-r from-transparent via-[var(--border-strong)] to-transparent opacity-30" />

          <section className="space-y-4">
            <h2 className="text-2xl font-medium" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              6. Limitation of Liability
            </h2>
            <p className="text-base leading-relaxed font-sans" style={{ color: 'var(--text-2)' }}>
              Veraawell acts as a platform connecting users with independent mental health professionals. To the maximum extent permitted by law, Veraawell shall not be liable for any indirect, incidental, special, or consequential damages arising from the use of the platform or services provided by therapists.
            </p>
          </section>

          <div className="w-full h-px bg-gradient-to-r from-transparent via-[var(--border-strong)] to-transparent opacity-30" />

          <section className="space-y-4">
            <h2 className="text-2xl font-medium" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              7. Account Suspension & Termination
            </h2>
            <p className="text-base leading-relaxed font-sans" style={{ color: 'var(--text-2)' }}>
              We reserve the right to suspend or terminate your account at any time, with or without notice, if we determine that you have violated these Terms of Service or engaged in behavior that compromises the safety or integrity of the platform.
            </p>
          </section>

          <div className="w-full h-px bg-gradient-to-r from-transparent via-[var(--border-strong)] to-transparent opacity-30" />

          <section className="space-y-4">
            <h2 className="text-2xl font-medium" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              8. Intellectual Property
            </h2>
            <p className="text-base leading-relaxed font-sans" style={{ color: 'var(--text-2)' }}>
              All content, features, and functionality on the Veraawell platform, including but not limited to text, graphics, logos, and software, are the exclusive property of Veraawell and are protected by applicable intellectual property laws.
            </p>
          </section>

          {/* Contact CTA */}
          <div className="mt-12 p-8 rounded-3xl bg-[var(--dark-bg)] text-center">
            <p className="text-[var(--dark-text-2)] font-sans mb-4">Need clarification on any of our terms?</p>
            <a 
              href="mailto:support@veraawell.com" 
              className="inline-flex items-center justify-center px-6 py-3 rounded-full font-medium transition-colors"
              style={{ background: 'var(--teal)', color: 'white' }}
            >
              Contact Compliance Team
            </a>
          </div>

        </motion.div>
      </div>
    </div>
  );
}
