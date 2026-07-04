import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiActivity, FiBriefcase, FiAlertTriangle, FiCheckSquare } from 'react-icons/fi';

export default function TermsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#fcfbfa] py-16 px-4 sm:px-6 lg:px-8 flex flex-col items-center">
      {/* Header Info */}
      <div className="w-full max-w-3xl mb-6 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-900 transition-colors font-sans"
        >
          <FiArrowLeft size={13} /> Back
        </button>
        <span className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase font-sans">
          Last Updated: May 2026
        </span>
      </div>

      {/* Document Container */}
      <div className="w-full max-w-3xl bg-white border border-neutral-200/80 shadow-sm rounded-3xl overflow-hidden p-6 sm:p-12">
        {/* Title */}
        <div className="border-b border-neutral-100 pb-6 mb-8 text-center sm:text-left">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 font-sans tracking-tight">Terms of Service</h1>
          <p className="text-xs text-neutral-400 mt-1 font-sans">
            User agreements, rules, and medical guidelines on Veraawell.
          </p>
        </div>

        {/* Quick Notices */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          <div className="border border-neutral-100 rounded-2xl p-4 flex gap-3 items-start bg-neutral-50/50">
            <FiActivity className="text-[#0097b2] flex-shrink-0 mt-0.5" size={16} />
            <div className="space-y-1">
              <h3 className="text-xs font-bold text-neutral-800 font-sans">Non-Emergency Service</h3>
              <p className="text-[11px] text-neutral-500 leading-normal font-sans">
                Veraawell is NOT a crisis hotline. If you face a medical emergency, visit a local hospital immediately.
              </p>
            </div>
          </div>
          <div className="border border-neutral-100 rounded-2xl p-4 flex gap-3 items-start bg-neutral-50/50">
            <FiBriefcase className="text-[#0097b2] flex-shrink-0 mt-0.5" size={16} />
            <div className="space-y-1">
              <h3 className="text-xs font-bold text-neutral-800 font-sans">Licensed Therapists</h3>
              <p className="text-[11px] text-neutral-500 leading-normal font-sans">
                All consulting doctors are licensed professionals verified by regulatory bodies.
              </p>
            </div>
          </div>
        </div>

        {/* Content Sections */}
        <div className="space-y-8 text-neutral-700 text-xs sm:text-sm leading-relaxed font-sans font-sans">
          
          <section className="space-y-3">
            <h2 className="text-sm sm:text-base font-bold text-neutral-900 flex items-center gap-2">
              <FiCheckSquare className="text-neutral-500" size={14} /> 1. Acceptance of Terms
            </h2>
            <p>
              By accessing the website and utilizing our consultation platform, you agree to comply with and be bound by these Terms of Service. If you disagree with any portion of these guidelines, please stop using our services immediately.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm sm:text-base font-bold text-neutral-900 flex items-center gap-2">
              <FiAlertTriangle className="text-neutral-500" size={14} /> 2. Clinical Disclaimer
            </h2>
            <p>
              Therapists on the platform offer counseling, behavioral coaching, and psychological assessments. They do NOT prescribe controlled medical substances. If your clinical state requires physical checks or drug prescriptions, you should consult an in-person psychiatrist or visit a hospital.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm sm:text-base font-bold text-neutral-900">3. Appointments & Cancellations</h2>
            <p>
              Session bookings are managed by the patient and are subject to therapist availability. 
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-neutral-600">
              <li><strong>Free Discovery Sessions:</strong> Eligible users can schedule one free discovery session. Repeated sign-ups for multiple free discovery sessions represent a violation of platform guidelines.</li>
              <li><strong>Cancellation Window:</strong> Scheduled slots may be cancelled or rescheduled up to 4 hours before the session start time without penalty. Cancellations inside 4 hours are non-refundable.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm sm:text-base font-bold text-neutral-900">4. Code of Conduct</h2>
            <p>
              Veraawell enforces a strict policy against harassment, abuse, or inappropriate behavior towards our consulting doctors. We reserve the absolute right to suspend or terminate accounts that exhibit abusive or unlawful behavior.
            </p>
          </section>
          
        </div>

        {/* Footer Accent */}
        <div className="border-t border-neutral-100 mt-10 pt-6 flex justify-between items-center text-[10px] text-neutral-400 font-sans">
          <span>Veraawell Compliance Committee</span>
          <a href="mailto:support@veraawell.com" className="hover:text-neutral-700 underline font-medium">support@veraawell.com</a>
        </div>
      </div>
    </div>
  );
}
