import React, { useState } from 'react';
import { API_BASE_URL } from '../config/api';
import { Upload, X, FileText, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useScrollReveal } from '../hooks/useScrollReveal';
import LeafDecor from '../components/ui/LeafDecor';
import SparkDecor from '../components/ui/SparkDecor';

const CareerPage: React.FC = () => {

  const headerRef = useScrollReveal<HTMLDivElement>();
  const heroImageRef = useScrollReveal<HTMLDivElement>();
  const bannerRef = useScrollReveal<HTMLDivElement>();
  const card1Ref = useScrollReveal<HTMLDivElement>();
  const card2Ref = useScrollReveal<HTMLDivElement>();
  const card3Ref = useScrollReveal<HTMLDivElement>();
  const formRef = useScrollReveal<HTMLDivElement>();

  const [activeTab, setActiveTab] = useState<'partner' | 'professional' | 'other'>('professional');
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: '',
    email: '',
    phoneNo: '',
    password: '',
    confirmPassword: '',
    specialization: '',
    licenseNumber: '',
    jobRole: '',
    professionalMessage: '',
    heardAboutUs: ''
  });
  const [documents, setDocuments] = useState<{ file: File, uploading: boolean, error?: string, uploaded?: boolean }[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<{ fileName: string, fileUrl: string, fileType: string, cloudinaryPublicId: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const specializationOptions = [
    'Clinical Psychologist',
    'Counseling Psychologist',
    'Psychiatrist',
    'Psychotherapist',
    'Marriage & Family Therapist',
    'Child Psychologist',
    'Neuropsychologist',
    'Health Psychologist',
    'Forensic Psychologist',
    'Other'
  ];

  const heardAboutUsOptions = [
    'LinkedIn',
    'Facebook',
    'Instagram',
    'Friend/Colleague',
    'Search Engine',
    'Other'
  ];

  const jobRoleOptions = [
    'Psychologist',
    'Psychiatrist',
    'Counselor',
    'Therapist',
    'Social Worker',
    'Mental Health Nurse',
    'Other'
  ];

  const scrollToForm = () => {
    const formElement = document.getElementById('join-us-form');
    if (formElement) {
      formElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    // Validate file types and sizes
    const validFiles = files.filter(file => {
      const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      const maxSize = 5 * 1024 * 1024; // 5MB

      if (!validTypes.includes(file.type)) {
        setError(`${file.name} is not a valid file type. Only PDF, JPG, and PNG are allowed.`);
        return false;
      }
      if (file.size > maxSize) {
        setError(`${file.name} is too large. Maximum size is 5MB.`);
        return false;
      }
      return true;
    });

    // Limit to 5 documents total
    const totalDocs = documents.length + uploadedDocs.length + validFiles.length;
    if (totalDocs > 5) {
      setError('You can upload a maximum of 5 documents.');
      return;
    }

    setDocuments(prev => [...prev, ...validFiles.map(file => ({ file, uploading: false }))]);
    setError('');
  };

  const uploadSingleDocument = async (index: number) => {
    const doc = documents[index];
    if (doc.uploaded || doc.uploading) return;

    setDocuments(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], uploading: true, error: undefined };
      return copy;
    });

    const formDataObj = new FormData();
    formDataObj.append('document', doc.file);

    try {
      const response = await fetch(`${API_BASE_URL}/upload/doctor-document`, {
        method: 'POST',
        body: formDataObj
      });

      const data = await response.json();

      if (response.ok) {
        setUploadedDocs(prev => [...prev, data.document]);
        setDocuments(prev => prev.filter((_, i) => i !== index));
        toast.success(`Uploaded ${doc.file.name}`);
      } else {
        throw new Error(data.message || 'Failed to upload document');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setDocuments(prev => {
        const copy = [...prev];
        copy[index] = { ...copy[index], uploading: false, error: message };
        return copy;
      });
      toast.error(`Failed to upload ${doc.file.name}: ${message}`);
    }
  };

  const removeDocument = (index: number) => {
    setDocuments(prev => prev.filter((_, i) => i !== index));
  };

  const removeUploadedDoc = (index: number) => {
    setUploadedDocs(prev => prev.filter((_, i) => i !== index));
  };

  const uploadDocuments = async (): Promise<typeof uploadedDocs> => {
    if (documents.length === 0) return uploadedDocs;

    setUploading(true);
    const formDataObj = new FormData();
    documents.forEach(doc => {
      formDataObj.append('documents', doc.file);
    });

    try {
      const response = await fetch(`${API_BASE_URL}/upload/doctor-documents`, {
        method: 'POST',
        body: formDataObj
      });

      const data = await response.json();

      if (response.ok) {
        const newDocs = [...uploadedDocs, ...data.documents];
        setUploadedDocs(newDocs);
        setDocuments([]);
        return newDocs;
      } else {
        throw new Error(data.message || 'Failed to upload documents');
      }
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Document upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (!formData.firstName || !formData.email || !formData.phoneNo || !formData.password) {
      setError('Please fill in all required fields');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (!formData.specialization) {
      setError('Please select your specialization');
      return;
    }

    if (!formData.jobRole) {
      setError('Please select your job role');
      return;
    }

    setLoading(true);

    try {
      // STEP 1: Upload documents first
      const allDocs = await uploadDocuments();
      // STEP 2: Submit registration directly (No OTP)
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          firstName: formData.firstName,
          email: formData.email,
          username: formData.email,
          phoneNo: formData.phoneNo,
          password: formData.password,
          role: 'doctor',
          specialization: formData.specialization,
          licenseNumber: formData.licenseNumber,
          jobRole: formData.jobRole,
          professionalMessage: formData.professionalMessage,
          heardAboutUs: formData.heardAboutUs,
          documents: allDocs // Use allDocs directly
        })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Application submitted successfully! Please wait for admin approval. Once approved, you will be able to log in using the email and password you just provided.');

        // Show important password reminder toast
        toast.success(
          'Application submitted! IMPORTANT: Please remember the email and password you just used to register. You will need them to log in once your account is approved by the admin.',
          {
            duration: 8000,
            icon: '',
            style: {
              background: '#F0FDF4',
              border: '1px solid #22c55e',
              padding: '16px',
              color: '#166534',
              maxWidth: '500px'
            },
          }
        );

        // Clear form
        setFormData({
          firstName: '',
          email: '',
          phoneNo: '',
          password: '',
          confirmPassword: '',
          specialization: '',
          licenseNumber: '',
          jobRole: '',
          professionalMessage: '',
          heardAboutUs: ''
        });
        setDocuments([]);
        setUploadedDocs([]);
      } else {
        setError(data.message || 'Registration failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[var(--bg)] min-h-screen relative overflow-hidden font-sans">
      
      {/* ── Background Immersive Gradients & Decor ── */}
      <div 
        className="absolute top-[-10%] left-[-20%] w-[80vw] h-[80vw] rounded-full mix-blend-multiply filter blur-[120px] opacity-40 z-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(0,151,178,0.12) 0%, transparent 70%)', animation: 'blob-drift 25s ease-in-out infinite alternate' }}
      />
      <div 
        className="absolute bottom-[-10%] right-[-10%] w-[70vw] h-[70vw] rounded-full mix-blend-multiply filter blur-[100px] opacity-40 z-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(107,168,136,0.12) 0%, transparent 70%)', animation: 'blob-drift-2 20s ease-in-out infinite alternate' }}
      />

      <div className="absolute top-0 right-0 pointer-events-none z-0 hidden lg:block">
        <LeafDecor
          style={{ position: 'absolute', top: '-60px', right: '-60px', width: '380px', height: '380px', transform: 'rotate(45deg)', opacity: 0.6, animation: 'float-card 10s ease-in-out infinite alternate' }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24 relative z-10">
        
        {/* ── Premium Hero Section ── */}
        <div ref={headerRef} data-reveal className="text-center max-w-4xl mx-auto mb-10 relative">
          <div className="absolute top-[10%] -left-8 md:-left-16 lg:-left-24 pointer-events-none z-0 hidden sm:block">
            <SparkDecor color="var(--teal)" style={{ width: '120px', height: '120px', opacity: 0.5, animation: 'float-card 8s ease-in-out infinite alternate-reverse' }} />
          </div>

          <span className="text-xs font-medium tracking-widest uppercase block mb-4" style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>
            — Join Our Team
          </span>
          <h1 className="leading-tight mb-2" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(40px, 5vw, 64px)', color: 'var(--text)', letterSpacing: '-0.02em' }}>
            Careers
          </h1>
          <p className="text-[20px] md:text-[24px] mt-4" style={{ color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}>
            Making You Happier.
          </p>
        </div>

        {/* Hero Image - Perfectly Sized */}
        <div className="relative mb-24">
          <div ref={heroImageRef} data-reveal data-delay="1" className="relative w-full max-w-5xl mx-auto group rounded-[32px] overflow-hidden shadow-md border border-[var(--border)]">
            <img
              src="/carrer-page.png"
              alt="Career Veraawell"
              className="w-full h-auto transform group-hover:scale-[1.03] transition-transform duration-1000 ease-out"
            />
          </div>
        </div>

        {/* Premium Marquee */}
        <div ref={bannerRef} data-reveal className="w-full max-w-7xl mx-auto overflow-hidden mb-24 border-y border-[var(--border)] py-6 relative bg-[var(--surface)]">
           <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-[var(--surface)] to-transparent z-10"></div>
           <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-[var(--surface)] to-transparent z-10"></div>
           
           <div className="whitespace-nowrap flex" style={{ animation: 'scroll 30s linear infinite' }}>
             {[...Array(6)].map((_, i) => (
               <React.Fragment key={i}>
                 <span className="font-bold tracking-widest uppercase mx-6 text-[var(--teal)]"
                   style={{ 
                     fontSize: 'clamp(0.875rem, 1.5vw, 1.125rem)',
                     fontFamily: 'var(--font-mono)'
                   }}>
                   Join Us As A Professional
                 </span>
                 <span className="mx-6 text-[var(--teal)] opacity-50" style={{ fontSize: '1.2rem' }}>✦</span>
                 <span className="font-bold tracking-widest uppercase mx-6 text-[var(--text-3)]"
                   style={{ 
                     fontSize: 'clamp(0.875rem, 1.5vw, 1.125rem)',
                     fontFamily: 'var(--font-mono)'
                   }}>
                   Transform Mental Healthcare
                 </span>
                 <span className="mx-6 text-[var(--teal)] opacity-50" style={{ fontSize: '1.2rem' }}>✦</span>
               </React.Fragment>
             ))}
           </div>
        </div>
        
        <style dangerouslySetInnerHTML={{
          __html: `
          @keyframes scroll {
            0% { transform: translateX(0%); }
            100% { transform: translateX(-50%); }
          }
        `
        }} />

        {/* ── Content Sections (Bento-style alternating layout) ── */}
        <div className="flex flex-col gap-8 md:gap-12 mb-24">
          
          {/* Why Choose Us Card */}
          <div ref={card1Ref} data-reveal className="flex flex-col md:flex-row bg-[var(--surface)] border border-[var(--border)] rounded-[32px] overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 group">
            <div className="flex-1 p-8 md:p-12 lg:p-16 flex flex-col justify-center">
              <span className="text-xs font-bold tracking-[0.2em] mb-6" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                01
              </span>
              <h2 className="text-[32px] md:text-[40px] font-bold mb-6" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                Why Choose Us?
              </h2>
              <div className="text-[16px] leading-relaxed space-y-4" style={{ color: 'var(--text-2)' }}>
                <p>We provide a comprehensive mental wellness platform designed to make therapy accessible, transparent, and effective. With a flexible pricing model, individuals can choose plans that suit their needs without financial strain.</p>
                <p>Our progress-tracking dashboard and session-wise reports ensure complete clarity on personal growth and improvement. Offering on-demand therapy sessions and a strong network of highly qualified psychologists, we bring expert support right when it's needed the most.</p>
              </div>
            </div>
            <div className="w-full md:w-[45%] bg-[#EAF1F8] relative overflow-hidden min-h-[300px]">
               <img src="/carrer-01.svg" alt="Why Choose Us illustration" className="absolute inset-0 w-full h-full object-cover mix-blend-multiply opacity-90 group-hover:scale-105 transition-transform duration-700" />
            </div>
          </div>

          {/* Culture At Veraawell Card */}
          <div ref={card2Ref} data-reveal data-delay="1" className="flex flex-col md:flex-row-reverse bg-[var(--surface)] border border-[var(--border)] rounded-[32px] overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 group">
            <div className="flex-1 p-8 md:p-12 lg:p-16 flex flex-col justify-center">
              <span className="text-xs font-bold tracking-[0.2em] mb-6" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                02
              </span>
              <h2 className="text-[32px] md:text-[40px] font-bold mb-6" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                Culture At Veraawell
              </h2>
              <div className="text-[16px] leading-relaxed space-y-4" style={{ color: 'var(--text-2)' }}>
                <p>We foster a collaborative, empathetic, and innovative culture. We believe in providing our professionals with the autonomy they need to effectively treat their clients, while supporting them with top-tier technological tools.</p>
                <p>Continuous learning and peer support are at the core of our daily operations. We want you to grow as a professional while you help your clients grow.</p>
              </div>
            </div>
            <div className="w-full md:w-[45%] bg-[#FDECEE] relative overflow-hidden min-h-[300px]">
               <img src="/carrer-02.svg" alt="Culture illustration" className="absolute inset-0 w-full h-full object-cover mix-blend-multiply opacity-90 group-hover:scale-105 transition-transform duration-700" />
            </div>
          </div>

          {/* Benefits of Joining Card */}
          <div ref={card3Ref} data-reveal data-delay="2" className="flex flex-col md:flex-row bg-[var(--surface)] border border-[var(--border)] rounded-[32px] overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 group">
            <div className="flex-1 p-8 md:p-12 lg:p-16 flex flex-col justify-center">
              <span className="text-xs font-bold tracking-[0.2em] mb-6" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                03
              </span>
              <h2 className="text-[32px] md:text-[40px] font-bold mb-6" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                Benefits of Joining
              </h2>
              <div className="text-[16px] leading-relaxed space-y-4" style={{ color: 'var(--text-2)' }}>
                <p>By joining Veraawell, you instantly gain access to a platform that handles your scheduling, billing, and technical support, so you can focus entirely on your clients.</p>
                <p>Enjoy flexible hours, competitive compensation, and the ability to work from anywhere. Be a part of a movement that is de-stigmatizing mental health across India.</p>
              </div>
            </div>
          </div>

        </div>

        {/* ── Join Us Form Section ── */}
        <div ref={formRef} data-reveal id="join-us-form" className="w-full max-w-3xl mx-auto bg-[var(--surface)] border border-[var(--border)] rounded-[32px] shadow-sm p-8 md:p-12 lg:p-16 relative overflow-hidden">
          {/* Subtle background flair */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--teal-muted)] rounded-full filter blur-3xl opacity-50 z-0"></div>
          
          <div className="relative z-10">
            <h2 className="text-[32px] md:text-[48px] font-bold text-center mb-8" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
              Join Us Now
            </h2>

            {/* Tab Navigation */}
            <div className="flex gap-2 md:gap-4 mb-8 justify-center flex-wrap">
              <button
                onClick={() => { setActiveTab('partner'); setCurrentStep(1); }}
                className={`px-6 py-3 rounded-full font-medium text-[15px] transition-all ${activeTab === 'partner'
                  ? 'bg-[var(--teal)] text-white shadow-md'
                  : 'bg-transparent text-[var(--text-2)] border border-[var(--border)] hover:border-[var(--teal)] hover:text-[var(--teal)]'
                  }`}
              >
                Partner with us
              </button>
              <button
                onClick={() => { setActiveTab('professional'); setCurrentStep(1); }}
                className={`px-6 py-3 rounded-full font-medium text-[15px] transition-all ${activeTab === 'professional'
                  ? 'bg-[var(--teal)] text-white shadow-md'
                  : 'bg-transparent text-[var(--text-2)] border border-[var(--border)] hover:border-[var(--teal)] hover:text-[var(--teal)]'
                  }`}
              >
                Join as Professional
              </button>
              <button
                onClick={() => { setActiveTab('other'); setCurrentStep(1); }}
                className={`px-6 py-3 rounded-full font-medium text-[15px] transition-all ${activeTab === 'other'
                  ? 'bg-[var(--teal)] text-white shadow-md'
                  : 'bg-transparent text-[var(--text-2)] border border-[var(--border)] hover:border-[var(--teal)] hover:text-[var(--teal)]'
                  }`}
              >
                Other Queries
              </button>
            </div>

            {activeTab === 'professional' && (
              <>
                <p className="text-center text-[var(--text-2)] mb-8">
                  Register to become a mental health professional on our platform
                </p>

                {/* Progress Bar */}
                <div className="flex items-center justify-between mb-8 relative">
                   <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-[var(--border)] -z-10 rounded-full"></div>
                   <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-[var(--teal)] -z-10 rounded-full transition-all duration-500" style={{ width: `${((currentStep - 1) / 2) * 100}%` }}></div>
                   
                   {[1, 2, 3].map((step) => (
                     <div key={step} className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${currentStep >= step ? 'bg-[var(--teal)] text-white shadow-md scale-110' : 'bg-white text-[var(--text-3)] border border-[var(--border)]'}`}>
                       {step}
                     </div>
                   ))}
                </div>

                {/* Success/Error Messages */}
                {success && (
                  <div className="mb-6 p-4 bg-green-50/50 border border-green-200/50 rounded-2xl">
                    <p className="text-green-700 text-sm">{success}</p>
                  </div>
                )}
                {error && (
                  <div className="mb-6 p-4 bg-red-50/50 border border-red-200/50 rounded-2xl">
                    <p className="text-red-700 text-sm">{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  
                  {/* STEP 1 */}
                  {currentStep === 1 && (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-2)] mb-2">First Name *</label>
                          <input
                            type="text"
                            required
                            value={formData.firstName}
                            onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] focus:ring-2 focus:ring-[var(--teal)] focus:border-transparent outline-none transition-all bg-[var(--bg)]"
                            placeholder="John"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-2)] mb-2">Email Address *</label>
                          <input
                            type="email"
                            required
                            value={formData.email}
                            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] focus:ring-2 focus:ring-[var(--teal)] focus:border-transparent outline-none transition-all bg-[var(--bg)]"
                            placeholder="john@example.com"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-2)] mb-2">Phone Number *</label>
                          <input
                            type="tel"
                            required
                            value={formData.phoneNo}
                            onChange={(e) => setFormData(prev => ({ ...prev, phoneNo: e.target.value }))}
                            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] focus:ring-2 focus:ring-[var(--teal)] focus:border-transparent outline-none transition-all bg-[var(--bg)]"
                            placeholder="+91 98765 43210"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 2 */}
                  {currentStep === 2 && (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-2)] mb-2">Job Role *</label>
                          <select
                            required
                            value={formData.jobRole}
                            onChange={(e) => setFormData(prev => ({ ...prev, jobRole: e.target.value }))}
                            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] focus:ring-2 focus:ring-[var(--teal)] focus:border-transparent outline-none transition-all bg-[var(--bg)]"
                          >
                            <option value="">Select Role</option>
                            {jobRoleOptions.map(option => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-2)] mb-2">Specialization *</label>
                          <select
                            required
                            value={formData.specialization}
                            onChange={(e) => setFormData(prev => ({ ...prev, specialization: e.target.value }))}
                            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] focus:ring-2 focus:ring-[var(--teal)] focus:border-transparent outline-none transition-all bg-[var(--bg)]"
                          >
                            <option value="">Select Specialization</option>
                            {specializationOptions.map(option => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-2)] mb-2">License Number</label>
                          <input
                            type="text"
                            value={formData.licenseNumber}
                            onChange={(e) => setFormData(prev => ({ ...prev, licenseNumber: e.target.value }))}
                            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] focus:ring-2 focus:ring-[var(--teal)] focus:border-transparent outline-none transition-all bg-[var(--bg)]"
                            placeholder="Optional"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-2)] mb-2">How did you hear about us?</label>
                          <select
                            value={formData.heardAboutUs}
                            onChange={(e) => setFormData(prev => ({ ...prev, heardAboutUs: e.target.value }))}
                            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] focus:ring-2 focus:ring-[var(--teal)] focus:border-transparent outline-none transition-all bg-[var(--bg)]"
                          >
                            <option value="">Select an option (Optional)</option>
                            {heardAboutUsOptions.map(option => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-[var(--text-2)] mb-2">Why do you want to join us?</label>
                        <textarea
                          value={formData.professionalMessage}
                          onChange={(e) => setFormData(prev => ({ ...prev, professionalMessage: e.target.value }))}
                          className="w-full px-4 py-3 rounded-xl border border-[var(--border)] focus:ring-2 focus:ring-[var(--teal)] focus:border-transparent outline-none transition-all bg-[var(--bg)] resize-none"
                          rows={4}
                          placeholder="Optional message about your professional background and why you want to join Veraawell..."
                        />
                      </div>
                    </div>
                  )}

                  {/* STEP 3 */}
                  {currentStep === 3 && (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-2)] mb-2">Password *</label>
                          <input
                            type="password"
                            required
                            value={formData.password}
                            onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] focus:ring-2 focus:ring-[var(--teal)] focus:border-transparent outline-none transition-all bg-[var(--bg)]"
                            placeholder="Min 6 characters"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-2)] mb-2">Confirm Password *</label>
                          <input
                            type="password"
                            required
                            value={formData.confirmPassword}
                            onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] focus:ring-2 focus:ring-[var(--teal)] focus:border-transparent outline-none transition-all bg-[var(--bg)]"
                            placeholder="Re-enter password"
                          />
                        </div>
                      </div>

                      {/* Documents Section */}
                      <div className="pt-6 border-t border-[var(--border)]">
                        <label className="block text-[18px] font-bold text-[var(--text)] mb-2">Documents</label>
                        <p className="text-sm text-[var(--text-3)] mb-4">
                          Upload your CV, License Certificate, Degree, or other relevant documents. (Max 5 documents, PDF/JPG/PNG only, max 5MB each)
                        </p>
                        
                        <div className="space-y-3 mb-4">
                          {uploadedDocs.map((doc, index) => (
                            <div key={`uploaded-${index}`} className="flex items-center justify-between p-3 bg-green-50/50 border border-green-200/50 rounded-xl">
                              <div className="flex items-center gap-3">
                                <FileText className="w-5 h-5 text-green-600" />
                                <span className="text-sm font-medium text-green-800">{doc.fileName}</span>
                              </div>
                              <button type="button" onClick={() => removeUploadedDoc(index)} className="p-1 hover:bg-green-100 rounded-full transition-colors">
                                <X className="w-4 h-4 text-green-700" />
                              </button>
                            </div>
                          ))}

                          {documents.map((doc, index) => (
                            <div key={`pending-${index}`} className="flex items-center justify-between p-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl">
                              <div className="flex items-center gap-3">
                                <FileText className="w-5 h-5 text-[var(--text-2)]" />
                                <span className="text-sm font-medium text-[var(--text-2)]">{doc.file.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {doc.uploading && <Loader2 className="w-4 h-4 animate-spin text-[var(--teal)]" />}
                                {doc.error && <span className="text-xs text-red-500 mr-2">{doc.error}</span>}
                                {!doc.uploading && (
                                  <button type="button" onClick={() => removeDocument(index)} className="p-1 hover:bg-[var(--border)] rounded-full transition-colors">
                                    <X className="w-4 h-4 text-[var(--text-3)]" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {documents.length + uploadedDocs.length < 5 && (
                          <div className="relative">
                            <input
                              type="file"
                              multiple
                              accept=".pdf,.jpg,.jpeg,.png"
                              onChange={handleFileSelect}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="w-full flex flex-col items-center justify-center p-8 border-2 border-dashed border-[var(--border)] rounded-2xl bg-[var(--bg)] hover:bg-[var(--surface)] transition-colors group">
                              <Upload className="w-8 h-8 text-[var(--text-3)] mb-3 group-hover:text-[var(--teal)] transition-colors" />
                              <p className="text-sm font-medium text-[var(--text-2)] group-hover:text-[var(--teal)] transition-colors">Click or drag files to upload</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Navigation Buttons */}
                  <div className="flex justify-between items-center pt-8 border-t border-[var(--border)] mt-8">
                    {currentStep > 1 ? (
                      <button
                        type="button"
                        onClick={() => setCurrentStep(prev => prev - 1)}
                        className="px-6 py-3 rounded-full font-medium text-[var(--text-2)] hover:text-[var(--text)] transition-colors"
                      >
                        ← Back
                      </button>
                    ) : <div></div>}
                    
                    {currentStep < 3 ? (
                      <button
                        type="button"
                        onClick={() => setCurrentStep(prev => prev + 1)}
                        className="px-8 py-3 rounded-full bg-[var(--teal)] text-white font-medium shadow-md hover:shadow-lg transition-all"
                      >
                        Next Step →
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={loading || uploading}
                        className="rounded-full text-white font-medium shadow-md hover:shadow-lg transition-all px-8 py-3 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 bg-[var(--teal)] hover:bg-[var(--teal-muted)]"
                      >
                        {loading || uploading ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            {uploading ? 'Uploading...' : 'Registering...'}
                          </>
                        ) : (
                          'Submit Application'
                        )}
                      </button>
                    )}
                  </div>

                  <p className="text-center text-sm text-[var(--text-3)] mt-6">
                    Already have an account? <a href="/login" className="text-[var(--teal)] hover:underline font-medium">Sign in here</a>
                  </p>
                </form>
              </>
            )}

            {activeTab === 'partner' && (
              <div className="text-center py-16 animate-in fade-in">
                <p className="text-[var(--text-2)] text-lg">
                  Partnership opportunities coming soon! Please contact us at <a href="mailto:partnerships@veraawell.com" className="text-[var(--teal)] hover:underline">partnerships@veraawell.com</a>
                </p>
              </div>
            )}

            {activeTab === 'other' && (
              <div className="text-center py-16 animate-in fade-in">
                <p className="text-[var(--text-2)] text-lg">
                  For other queries, please reach out to us at <a href="mailto:support@veraawell.com" className="text-[var(--teal)] hover:underline">support@veraawell.com</a>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CareerPage;
