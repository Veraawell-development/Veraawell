import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiLock, FiShield, FiUserCheck, FiEye } from 'react-icons/fi';

export default function PrivacyPage() {
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
          <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 font-sans tracking-tight">Privacy Policy</h1>
          <p className="text-xs text-neutral-400 mt-1 font-sans">
            How we protect, collect, and handle your data at Veraawell.
          </p>
        </div>

        {/* Introduction Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          <div className="border border-neutral-100 rounded-2xl p-4 flex gap-3 items-start bg-neutral-50/50">
            <FiShield className="text-[#0097b2] flex-shrink-0 mt-0.5" size={16} />
            <div className="space-y-1">
              <h3 className="text-xs font-bold text-neutral-800 font-sans">End-to-End Privacy</h3>
              <p className="text-[11px] text-neutral-500 leading-normal font-sans">
                Your session recordings and therapist conversations are completely secure and confidential.
              </p>
            </div>
          </div>
          <div className="border border-neutral-100 rounded-2xl p-4 flex gap-3 items-start bg-neutral-50/50">
            <FiLock className="text-[#0097b2] flex-shrink-0 mt-0.5" size={16} />
            <div className="space-y-1">
              <h3 className="text-xs font-bold text-neutral-800 font-sans">Data Control</h3>
              <p className="text-[11px] text-neutral-500 leading-normal font-sans">
                You can download, update, or request deletion of your account and notes at any time.
              </p>
            </div>
          </div>
        </div>

        {/* Content Sections */}
        <div className="space-y-8 text-neutral-700 text-xs sm:text-sm leading-relaxed font-sans">
          
          <section className="space-y-3">
            <h2 className="text-sm sm:text-base font-bold text-neutral-900 flex items-center gap-2">
              <FiUserCheck className="text-neutral-500" size={14} /> 1. Information We Collect
            </h2>
            <p>
              To provide a personalized therapist experience, we collect specific data when you interact with the platform:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-neutral-600">
              <li><strong>Profile Information:</strong> Full name, email address, phone number, and account password.</li>
              <li><strong>Clinical Notes:</strong> Summary notes, mental health assessments, and treatment recommendation details completed by your assigned doctor.</li>
              <li><strong>Chat & Connection Details:</strong> Real-time messaging history and video session timing metadata. Note that video calls are encrypted and never recorded.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm sm:text-base font-bold text-neutral-900 flex items-center gap-2">
              <FiEye className="text-neutral-500" size={14} /> 2. How We Use Your Data
            </h2>
            <p>
              We prioritize using your information strictly to coordinate your medical or psychological care:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-neutral-600">
              <li>To match you with licensed psychological professionals matching your service preferences.</li>
              <li>To compile clinical summaries and generate hospital-style post-session reports.</li>
              <li>To secure video and audio communication lines between patients and therapists.</li>
              <li>To prevent fraudulent behavior or server abuse. We never sell your personal data to marketing companies.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm sm:text-base font-bold text-neutral-900">3. Retention & Security</h2>
            <p>
              All clinical files, task logs, and assessment scores are stored in encrypted databases. Access to patient notes is restricted exclusively to the patient and their assigned therapists. We use industry-standard HTTPS/SSL encryption to secure all database transactions.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm sm:text-base font-bold text-neutral-900">4. Your Rights</h2>
            <p>
              You maintain full authority over your data. You may request access to, edit, or terminate your medical account by contacting our data protection representative at <strong>privacy@veraawell.com</strong>.
            </p>
          </section>
          
        </div>

        {/* Footer Accent */}
        <div className="border-t border-neutral-100 mt-10 pt-6 flex justify-between items-center text-[10px] text-neutral-400 font-sans">
          <span>Veraawell Data Compliance Officer</span>
          <a href="mailto:privacy@veraawell.com" className="hover:text-neutral-700 underline font-medium">privacy@veraawell.com</a>
        </div>
      </div>
    </div>
  );
}
