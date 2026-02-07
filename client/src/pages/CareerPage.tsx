import React, { useState } from 'react';
import { API_BASE_URL } from '../config/api';
import { Upload, X, FileText, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import OTPVerificationModal from '../components/OTPVerificationModal';

const CareerPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'partner' | 'professional' | 'other'>('professional');
  const [formData, setFormData] = useState({
    firstName: '',
    email: '',
    phoneNo: '',
    password: '',
    confirmPassword: '',
    specialization: '',
    licenseNumber: '',
    jobRole: '',
    professionalMessage: ''
  });
  const [documents, setDocuments] = useState<File[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<{ fileName: string, fileUrl: string, fileType: string, cloudinaryPublicId: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // OTP verification states
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [otpEmail, setOtpEmail] = useState('');
  const [pendingDocs, setPendingDocs] = useState<typeof uploadedDocs>([]);

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

    setDocuments(prev => [...prev, ...validFiles]);
    setError('');
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
      formDataObj.append('documents', doc);
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
      setPendingDocs(allDocs);

      // STEP 2: Send OTP to email
      const otpResponse = await fetch(`${API_BASE_URL}/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email.toLowerCase(),
          userType: 'doctor'
        }),
      });

      const otpData = await otpResponse.json();

      if (otpResponse.ok && otpData.success) {
        toast.success('OTP sent to your email!');
        setOtpEmail(formData.email);
        setShowOTPModal(true);
        setLoading(false);
      } else {
        setError(otpData.message || 'Failed to send OTP');
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
      setLoading(false);
    }
  };

  // STEP 3: Handle OTP verification success
  const handleOTPVerified = async () => {
    setShowOTPModal(false);
    setLoading(true);

    try {
      // STEP 4: Submit registration after OTP verification
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
          documents: pendingDocs
        })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Registration successful! Please wait for admin approval. You will receive an email once approved.');

        // Show important password reminder toast
        toast.success(
          'Registration successful! IMPORTANT: Please remember the password you just created. You will need it to log in to your account.',
          {
            duration: 8000,
            icon: '🔐',
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
          professionalMessage: ''
        });
        setDocuments([]);
        setUploadedDocs([]);
        setPendingDocs([]);
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
    <>
      <div className="min-h-screen bg-white">
        {/* Hero Section */}
        <div className="relative w-full h-[500px] md:h-[971px]">
          <img
            src="/carrer-bg.svg"
            alt="Career Background"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
            <h1 className="text-white font-extrabold text-[48px] md:text-[110px] mb-2 md:mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
              Careers
            </h1>
            <div className="relative">
              <div className="h-[3px] md:h-[6px] w-[200px] md:w-[522px] bg-white mb-1 md:mb-2"></div>
              <p className="text-white text-[28px] md:text-[64px] font-normal text-center" style={{ fontFamily: 'Bree Serif, serif', textShadow: '0px 4px 4px rgba(0,0,0,0.25)' }}>
                Making You Happier
              </p>
            </div>
          </div>
        </div>

        {/* Scrolling Banner Section */}
        <div className="py-3 sm:py-4 overflow-hidden" style={{ backgroundColor: '#A8D5BA' }}>
          <div
            className="whitespace-nowrap"
            style={{
              animation: 'scroll 20s linear infinite'
            }}
          >
            {[...Array(6)].map((_, i) => (
              <span key={i} className="text-white font-medium mx-4 sm:mx-6 md:mx-8"
                style={{ fontSize: 'clamp(0.875rem, 2vw, 1.125rem)' }}>
                Join us as a Mental Health Professional
              </span>
            ))}
          </div>
        </div>

        {/* Main Content Section */}
        <div className="bg-white py-10 sm:py-14 md:py-20 px-4">
          <div className="max-w-5xl mx-auto text-center">
            <h2 className="font-normal mb-6 sm:mb-8 md:mb-12 leading-relaxed text-[24px] md:text-[40px]" style={{ color: '#E07A5F', fontFamily: 'Inter, sans-serif' }}>
              Join us as a mental health professional to kickstart your practice online!
            </h2>
            <button
              onClick={scrollToForm}
              className="text-white font-semibold rounded-2xl transition-colors duration-200 shadow-lg hover:opacity-90 px-8 py-3 text-[18px] md:text-[24px]"
              style={{ backgroundColor: '#E07A5F', fontFamily: 'Inter, sans-serif' }}
            >
              Join Now
            </button>
          </div>
        </div>

        {/* Add custom CSS for scrolling animation */}
        <style dangerouslySetInnerHTML={{
          __html: `
          html {
            scroll-behavior: smooth;
          }
          @keyframes scroll {
            0% {
              transform: translateX(100%);
            }
            100% {
              transform: translateX(-100%);
            }
          }
        `
        }} />
      </div>

      {/* Why Choose Us Section */}
      <div className="w-full bg-white px-4 md:px-[37px] py-4 md:py-8">
        <div className="relative w-full min-h-[400px] md:h-[483px] bg-[#ABA5D1] border border-[rgba(0,0,0,0.16)] rounded-[10px] mb-4 md:mb-8 flex flex-col md:flex-row">
          <div className="w-full md:w-[362px] h-[250px] md:h-[483px] rounded-[10px] overflow-hidden flex-shrink-0">
            <img src="/carrer-01.svg" alt="Mental Health Professional" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 p-6 md:p-12 flex flex-col justify-center">
            <h2 className="text-white font-extrabold text-[28px] md:text-[45px] mb-4 md:mb-8 text-left md:text-right" style={{ fontFamily: 'Inter, sans-serif' }}>
              Why Choose Us?
            </h2>
            <div className="text-white text-[16px] md:text-[26px] leading-normal text-justify" style={{ fontFamily: 'Inter, sans-serif' }}>
              <p>We provide a comprehensive mental wellness platform designed to make therapy accessible, transparent, and effective. With a flexible pricing model, individuals can choose plans that suit their needs without financial strain. Our progress-tracking dashboard and session-wise reports ensure complete clarity on personal growth and improvement. Offering on-demand therapy sessions and a strong network of highly qualified psychologists, we bring expert support right when it's needed the most.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Culture At Veraawell Section */}
      <div className="w-full bg-white px-4 md:px-[37px] py-4 md:py-8">
        <div className="relative w-full min-h-[400px] md:h-[483px] bg-[#6DBEDF] border border-[rgba(0,0,0,0.16)] rounded-[10px] mb-4 md:mb-8 flex flex-col md:flex-row">
          <div className="flex-1 p-6 md:p-12">
            <h2 className="text-white font-extrabold text-[28px] md:text-[40px] mb-4 md:mb-8" style={{ fontFamily: 'Inter, sans-serif' }}>
              Culture At Veraawell
            </h2>
            <div className="text-white text-[16px] md:text-[26px] leading-normal text-justify space-y-2 md:space-y-4" style={{ fontFamily: 'Inter, sans-serif' }}>
              <p>We provide a comprehensive mental wellness platform designed to make therapy accessible, transparent, and effective. With a flexible pricing model, individuals can choose plans that suit their needs without financial strain. Our progress-tracking dashboard and session-wise reports ensure complete clarity on personal growth and improvement. Offering on-demand therapy sessions and a strong network of highly qualified psychologists, we bring expert support right when it's needed the most.</p>
            </div>
          </div>
          <div className="w-full md:w-[362px] h-[250px] md:h-[483px] rounded-[10px] overflow-hidden flex-shrink-0">
            <img src="/carrer-02.svg" alt="Culture At Veraawell" className="w-full h-full object-cover" />
          </div>
        </div>
      </div>

      {/* Benefits of Joining Section */}
      <div className="w-full bg-white px-4 md:px-[37px] py-4 md:py-8">
        <div className="relative w-full min-h-[300px] bg-[#38ABAE] border border-[rgba(0,0,0,0.16)] rounded-[10px] mb-4 md:mb-8 p-6 md:p-12">
          <h2 className="text-white font-extrabold text-[32px] md:text-[45px] text-center mb-4 md:mb-8" style={{ fontFamily: 'Inter, sans-serif' }}>
            Benefits of Joining
          </h2>
          <div className="text-white text-[16px] md:text-[26px] leading-normal text-justify max-w-6xl mx-auto" style={{ fontFamily: 'Inter, sans-serif' }}>
            <p>We provide a comprehensive mental wellness platform designed to make therapy accessible, transparent, and effective. With a flexible pricing model, individuals can choose plans that suit their needs without financial strain. Our progress-tracking dashboard and session-wise reports ensure complete clarity on personal growth and improvement. Offering on-demand therapy sessions and a strong network of highly qualified psychologists, we bring expert support right when it's needed the most.</p>
          </div>
        </div>
      </div>

      {/* Join Us Now Form - Centered */}
      <div id="join-us-form" className="w-full bg-white px-4 md:px-[37px] py-4 md:py-8">
        <div className="max-w-4xl mx-auto rounded-[10px] p-6 md:p-12" style={{ backgroundColor: 'rgba(248,219,185,0.49)', border: '1px solid rgba(0,0,0,0.16)' }}>
          <h2 className="text-[#BE7959] font-extrabold text-[32px] md:text-[52px] text-center mb-6 md:mb-8" style={{ fontFamily: 'Inter, sans-serif' }}>
            Join Us Now
          </h2>

          {/* Tab Navigation */}
          <div className="flex gap-2 md:gap-4 mb-6 md:mb-8 justify-center flex-wrap">
            <button
              onClick={() => setActiveTab('partner')}
              className={`px-4 md:px-6 py-2 md:py-3 rounded-lg font-medium text-[14px] md:text-[16px] transition-all ${activeTab === 'partner'
                ? 'bg-[#C17B5C] text-white shadow-md'
                : 'bg-white text-[#C17B5C] border-2 border-[#C17B5C] hover:bg-[#C17B5C] hover:text-white'
                }`}
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Partner with us
            </button>
            <button
              onClick={() => setActiveTab('professional')}
              className={`px-4 md:px-6 py-2 md:py-3 rounded-lg font-medium text-[14px] md:text-[16px] transition-all ${activeTab === 'professional'
                ? 'bg-[#C17B5C] text-white shadow-md'
                : 'bg-white text-[#C17B5C] border-2 border-[#C17B5C] hover:bg-[#C17B5C] hover:text-white'
                }`}
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Join us as a professionals
            </button>
            <button
              onClick={() => setActiveTab('other')}
              className={`px-4 md:px-6 py-2 md:py-3 rounded-lg font-medium text-[14px] md:text-[16px] transition-all ${activeTab === 'other'
                ? 'bg-[#C17B5C] text-white shadow-md'
                : 'bg-white text-[#C17B5C] border-2 border-[#C17B5C] hover:bg-[#C17B5C] hover:text-white'
                }`}
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Other queries
            </button>
          </div>

          {activeTab === 'professional' && (
            <>
              <p className="text-center text-gray-700 mb-6" style={{ fontFamily: 'Inter, sans-serif' }}>
                Register to become a mental health professional on our platform
              </p>

              {/* Success/Error Messages */}
              {success && (
                <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-green-700 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>{success}</p>
                </div>
              )}
              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>{error}</p>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
                {/* Full Name */}
                <div>
                  <label className="block font-medium mb-2 text-[14px] md:text-[18px]" style={{ color: '#C17B5C', fontFamily: 'Inter, sans-serif' }}>
                    Full Name: <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    required
                    className="w-full rounded-lg border px-4 py-3 text-[14px] md:text-[16px] focus:outline-none focus:border-[#C17B5C]"
                    style={{ borderColor: '#E5E5E5', backgroundColor: 'white', fontFamily: 'Inter, sans-serif' }}
                  />
                </div>

                {/* Email and Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-medium mb-2 text-[14px] md:text-[18px]" style={{ color: '#C17B5C', fontFamily: 'Inter, sans-serif' }}>
                      E-mail: <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      className="w-full rounded-lg border px-4 py-3 text-[14px] md:text-[16px] focus:outline-none focus:border-[#C17B5C]"
                      style={{ borderColor: '#E5E5E5', backgroundColor: 'white', fontFamily: 'Inter, sans-serif' }}
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-2 text-[14px] md:text-[18px]" style={{ color: '#C17B5C', fontFamily: 'Inter, sans-serif' }}>
                      Phone no.: <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={formData.phoneNo}
                      onChange={(e) => setFormData({ ...formData, phoneNo: e.target.value })}
                      required
                      className="w-full rounded-lg border px-4 py-3 text-[14px] md:text-[16px] focus:outline-none focus:border-[#C17B5C]"
                      style={{ borderColor: '#E5E5E5', backgroundColor: 'white', fontFamily: 'Inter, sans-serif' }}
                    />
                  </div>
                </div>

                {/* Job Role and Specialization */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-medium mb-2 text-[14px] md:text-[18px]" style={{ color: '#C17B5C', fontFamily: 'Inter, sans-serif' }}>
                      Job role: <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.jobRole}
                      onChange={(e) => setFormData({ ...formData, jobRole: e.target.value })}
                      required
                      className="w-full rounded-lg border px-4 py-3 text-[14px] md:text-[16px] focus:outline-none focus:border-[#C17B5C]"
                      style={{ borderColor: '#E5E5E5', backgroundColor: 'white', fontFamily: 'Inter, sans-serif' }}
                    >
                      <option value="">Select job role</option>
                      {jobRoleOptions.map(role => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium mb-2 text-[14px] md:text-[18px]" style={{ color: '#C17B5C', fontFamily: 'Inter, sans-serif' }}>
                      Specialization: <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.specialization}
                      onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                      required
                      className="w-full rounded-lg border px-4 py-3 text-[14px] md:text-[16px] focus:outline-none focus:border-[#C17B5C]"
                      style={{ borderColor: '#E5E5E5', backgroundColor: 'white', fontFamily: 'Inter, sans-serif' }}
                    >
                      <option value="">Select specialization</option>
                      {specializationOptions.map(spec => (
                        <option key={spec} value={spec}>{spec}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* License Number */}
                <div>
                  <label className="block font-medium mb-2 text-[14px] md:text-[18px]" style={{ color: '#C17B5C', fontFamily: 'Inter, sans-serif' }}>
                    License Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.licenseNumber}
                    onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                    placeholder="Professional license or registration number"
                    className="w-full rounded-lg border px-4 py-3 text-[14px] md:text-[16px] focus:outline-none focus:border-[#C17B5C]"
                    style={{ borderColor: '#E5E5E5', backgroundColor: 'white', fontFamily: 'Inter, sans-serif' }}
                  />
                </div>

                {/* Upload Documents */}
                <div>
                  <label className="block font-medium mb-2 text-[14px] md:text-[18px]" style={{ color: '#C17B5C', fontFamily: 'Inter, sans-serif' }}>
                    Upload Documents:
                  </label>
                  <div className="border-2 border-dashed border-[#E5E5E5] rounded-lg p-4 md:p-6 text-center">
                    <input
                      type="file"
                      id="document-upload"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleFileSelect}
                      className="hidden"
                      disabled={uploading || loading}
                    />
                    <label
                      htmlFor="document-upload"
                      className="cursor-pointer inline-flex items-center gap-2 px-4 md:px-6 py-2 md:py-3 bg-[#C17B5C] text-white rounded-lg hover:opacity-90 transition-opacity text-[14px] md:text-[16px] font-medium"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      <Upload className="w-4 h-4 md:w-5 md:h-5" />
                      Choose file
                    </label>
                    <p className="text-xs md:text-sm text-gray-500 mt-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                      PDF, JPG, PNG (Max 5MB each, up to 5 files)
                    </p>
                  </div>

                  {/* Document Preview */}
                  {(documents.length > 0 || uploadedDocs.length > 0) && (
                    <div className="mt-3 space-y-2">
                      {uploadedDocs.map((doc, index) => (
                        <div key={`uploaded-${index}`} className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <FileText className="w-4 h-4 md:w-5 md:h-5 text-green-600 flex-shrink-0" />
                            <span className="text-xs md:text-sm text-green-700 truncate" style={{ fontFamily: 'Inter, sans-serif' }}>
                              {doc.fileName}
                            </span>
                            <span className="text-xs text-green-600">✓ Uploaded</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeUploadedDoc(index)}
                            className="text-green-600 hover:text-green-800 flex-shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {documents.map((doc, index) => (
                        <div key={`pending-${index}`} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <FileText className="w-4 h-4 md:w-5 md:h-5 text-gray-600 flex-shrink-0" />
                            <span className="text-xs md:text-sm text-gray-700 truncate" style={{ fontFamily: 'Inter, sans-serif' }}>
                              {doc.name}
                            </span>
                            <span className="text-xs text-gray-500">({(doc.size / 1024).toFixed(1)} KB)</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeDocument(index)}
                            className="text-gray-600 hover:text-gray-800 flex-shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Password Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-medium mb-2 text-[14px] md:text-[18px]" style={{ color: '#C17B5C', fontFamily: 'Inter, sans-serif' }}>
                      Password: <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                      minLength={6}
                      className="w-full rounded-lg border px-4 py-3 text-[14px] md:text-[16px] focus:outline-none focus:border-[#C17B5C]"
                      style={{ borderColor: '#E5E5E5', backgroundColor: 'white', fontFamily: 'Inter, sans-serif' }}
                      placeholder="Min. 6 characters"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-2 text-[14px] md:text-[18px]" style={{ color: '#C17B5C', fontFamily: 'Inter, sans-serif' }}>
                      Confirm Password: <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                      required
                      className="w-full rounded-lg border px-4 py-3 text-[14px] md:text-[16px] focus:outline-none focus:border-[#C17B5C]"
                      style={{ borderColor: '#E5E5E5', backgroundColor: 'white', fontFamily: 'Inter, sans-serif' }}
                    />
                  </div>
                </div>

                {/* How can we help you */}
                <div>
                  <label className="block font-medium mb-2 text-[14px] md:text-[18px]" style={{ color: '#C17B5C', fontFamily: 'Inter, sans-serif' }}>
                    How can we help you?
                  </label>
                  <textarea
                    value={formData.professionalMessage}
                    onChange={(e) => setFormData({ ...formData, professionalMessage: e.target.value })}
                    rows={4}
                    placeholder="Tell us about your experience, qualifications, or any questions..."
                    className="w-full rounded-lg border px-4 py-3 text-[14px] md:text-[16px] focus:outline-none focus:border-[#C17B5C] resize-none"
                    style={{ borderColor: '#E5E5E5', backgroundColor: 'white', fontFamily: 'Inter, sans-serif' }}
                  />
                </div>

                {/* Submit Button */}
                <div className="text-center pt-4">
                  <button
                    type="submit"
                    disabled={loading || uploading}
                    className="rounded-lg text-white font-bold shadow-lg hover:opacity-90 transition-opacity px-12 py-3 text-[18px] md:text-[24px] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                    style={{ backgroundColor: '#C17B5C', fontFamily: 'Inter, sans-serif' }}
                  >
                    {loading || uploading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {uploading ? 'Uploading...' : 'Registering...'}
                      </>
                    ) : (
                      'Submit'
                    )}
                  </button>
                </div>

                <p className="text-center text-sm text-gray-600 mt-4" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Already have an account? <a href="/auth" className="text-[#C17B5C] hover:underline font-semibold">Sign in here</a>
                </p>
              </form>
            </>
          )}

          {activeTab === 'partner' && (
            <div className="text-center py-12">
              <p className="text-gray-600 text-lg" style={{ fontFamily: 'Inter, sans-serif' }}>
                Partnership opportunities coming soon! Please contact us at <a href="mailto:partnerships@veraawell.com" className="text-[#C17B5C] hover:underline">partnerships@veraawell.com</a>
              </p>
            </div>
          )}

          {activeTab === 'other' && (
            <div className="text-center py-12">
              <p className="text-gray-600 text-lg" style={{ fontFamily: 'Inter, sans-serif' }}>
                For other queries, please reach out to us at <a href="mailto:support@veraawell.com" className="text-[#C17B5C] hover:underline">support@veraawell.com</a>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* OTP Verification Modal */}
      <OTPVerificationModal
        isOpen={showOTPModal}
        email={otpEmail}
        userType="doctor"
        onVerified={handleOTPVerified}
        onClose={() => {
          setShowOTPModal(false);
          setLoading(false);
        }}
      />
    </>
  );
};

export default CareerPage;
