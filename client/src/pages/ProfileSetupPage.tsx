import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ProfileImageUpload from '../components/ProfileImageUpload';
import BannerImageUpload from '../components/BannerImageUpload';
import BackToDashboard from '../components/BackToDashboard';
import { API_BASE_URL } from '../config/api';

const ProfileSetupPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;
  console.log('[ProfileSetupPage] RENDER - user:', user?.userId, 'role:', user?.role, 'currentStep:', currentStep);

  // Form state for doctor profile
  const [formData, setFormData] = useState({
    name: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
    profileImage: '',
    bannerImage: '',
    qualification: [] as string[],
    languages: [] as string[],
    type: '',
    experience: '',
    specialization: [] as string[],
    price20: '',
    price40: '',
    price55: '',
    audioPrice20: '',
    audioPrice40: '',
    audioPrice55: '',
    modeOfSession: [] as string[],
    quote: '',
    quoteAuthor: '',
    introduction: ''
  });

  const qualificationOptions = ['MBBS', 'MD', 'PhD', 'PsyD', 'MSc Psychology', 'MA Psychology', 'Licensed Therapist'];
  const languageOptions = ['English', 'Hindi', 'Bengali', 'Tamil', 'Telugu', 'Marathi', 'Gujarati', 'Kannada', 'Malayalam', 'Punjabi'];
  const typeOptions = ['Psychiatrist', 'Psychologist', 'Counselor', 'Therapist'];
  const specializationOptions = ['Anxiety', 'Depression', 'Stress Management', 'Relationship Issues', 'Trauma', 'PTSD', 'OCD', 'Bipolar Disorder', 'Addiction', 'Family Therapy', 'Child Psychology', 'Career Counseling'];
  const sessionModeOptions = ['Video Call', 'Audio Call', 'In-Person', 'Chat'];

  const handleMultiSelect = (field: 'qualification' | 'languages' | 'specialization' | 'modeOfSession', value: string) => {
    setFormData(prev => {
      const currentValues = prev[field];
      if (currentValues.includes(value)) {
        return { ...prev, [field]: currentValues.filter(v => v !== value) };
      } else {
        return { ...prev, [field]: [...currentValues, value] };
      }
    });
  };

  // Fetch existing profile data on component mount
  React.useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        console.log('[ProfileSetupPage] Fetching profile data...');
        const response = await fetch(`${API_BASE_URL}/profile/setup`, {
          method: 'GET',
          credentials: 'include',
          headers,
        });

        if (response.ok) {
          const data = await response.json();
          if (data.profile) {
            setFormData({
              name: data.profile.name || `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
              profileImage: data.profile.profileImage || '',
              bannerImage: data.profile.bannerImage || '',
              qualification: data.profile.qualification || [],
              languages: data.profile.languages || [],
              type: data.profile.type || '',
              experience: data.profile.experience || '',
              specialization: data.profile.specialization || [],
              price20: data.profile.price20 || '',
              price40: data.profile.price40 || '',
              price55: data.profile.price55 || '',
              audioPrice20: data.profile.audioPrice20 || '',
              audioPrice40: data.profile.audioPrice40 || '',
              audioPrice55: data.profile.audioPrice55 || '',
              // Ensure modeOfSession is always an array (handle legacy string data)
              modeOfSession: Array.isArray(data.profile.modeOfSession)
                ? data.profile.modeOfSession
                : (data.profile.modeOfSession ? [data.profile.modeOfSession] : []),
              quote: data.profile.quote || '',
              quoteAuthor: data.profile.quoteAuthor || '',
              introduction: data.profile.introduction || ''
            });
            // Keep isEditing true so users can always edit their profile
          }
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err);
        // Don't show error to user, just use empty form
      }
    };

    if (user?.role === 'doctor') {
      fetchProfile();
    }
  }, [user, API_BASE_URL]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    console.log('[ProfileSetupPage] handleSubmit called - will navigate to dashboard after save');

    try {
      const response = await fetch(`${API_BASE_URL}/profile/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ...formData,
          experience: parseInt(formData.experience) || 0,
          pricing: {
            session20: parseFloat(formData.price20) || 0,
            session40: parseFloat(formData.price40) || 0,
            session55: parseFloat(formData.price55) || 0,
            audio: {
              session20: parseFloat(formData.audioPrice20) || 0,
              session40: parseFloat(formData.audioPrice40) || 0,
              session55: parseFloat(formData.audioPrice55) || 0
            }
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to save profile');
      }

      // Redirect to dashboard after successful save
      console.log('[ProfileSetupPage] Save successful - navigating to dashboard');
      navigate(user?.role === 'doctor' ? '/doctor-dashboard' : '/patient-dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleNext = () => {
    if (currentStep < totalSteps && canProceed()) {
      setCurrentStep(currentStep + 1);
      setError(null);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setError(null);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return formData.name && formData.type && formData.experience;
      case 2:
        return formData.qualification.length > 0 && formData.languages.length > 0 && formData.specialization.length > 0;
      case 3:
        return formData.modeOfSession.length > 0;
      case 4:
        return true; // Optional step
      default:
        return false;
    }
  };

  const canNavigateToStep = (targetStep: number) => {
    return true; // Allow free navigation for easier editing
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1: return 'Basic Information';
      case 2: return 'Qualifications & Expertise';
      case 3: return 'Session Details';
      case 4: return 'Personal Touch';
      default: return '';
    }
  };

  const getStepDescription = () => {
    switch (currentStep) {
      case 1: return 'Your personal and professional details';
      case 2: return 'Your credentials and areas of specialization';
      case 3: return 'Pricing and session preferences';
      case 4: return 'Optional: Add a personal quote and introduction';
      default: return '';
    }
  };

  return (
    <div className="flex-1 min-h-0 w-full bg-gray-50 flex flex-col overflow-hidden pt-[64px] md:pt-[80px] box-border">
      {/* Minimal Header */}
      <div className="flex-shrink-0 z-10 bg-white border-b border-gray-100 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-1.5 hover:bg-gray-100 rounded-md transition-colors text-gray-400 hover:text-gray-700"
            aria-label="Go back"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Profile Settings</h1>
            <p className="text-xs text-gray-500 mt-0.5">Manage your public profile and preferences</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2 rounded-full font-medium text-sm transition-colors flex items-center gap-1.5 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area (Sidebar + Form) */}
      <div className="flex-1 overflow-hidden p-4 sm:p-6 lg:p-8 flex justify-center">
        <div className="max-w-6xl w-full flex bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 flex-shrink-0 border-r border-gray-200 bg-gray-50 overflow-y-auto hidden md:block">
            <nav className="p-4 space-y-2">
            {[
              { step: 1, title: 'Basic Information', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
              { step: 2, title: 'Qualifications', icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z' },
              { step: 3, title: 'Session Pricing', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
              { step: 4, title: 'Personal Touch', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
            ].map((item) => (
              <button
                key={item.step}
                type="button"
                onClick={() => setCurrentStep(item.step)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left font-medium ${
                  currentStep === item.step
                    ? 'bg-white shadow-sm border border-gray-200 text-teal-700'
                    : 'text-gray-600 hover:bg-gray-200/50 hover:text-gray-900'
                }`}
              >
                <div className={`p-1.5 rounded-lg ${currentStep === item.step ? 'bg-teal-50 text-teal-600' : 'bg-gray-100 text-gray-400'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                  </svg>
                </div>
                <span className="text-sm">{item.title}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Mobile Tabs */}
        <div className="md:hidden flex overflow-x-auto border-b border-gray-200 bg-gray-50 px-2 py-2 shrink-0 hide-scrollbar">
          {[1, 2, 3, 4].map((step) => (
            <button
              key={step}
              type="button"
              onClick={() => setCurrentStep(step)}
              className={`flex-shrink-0 px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                currentStep === step ? 'bg-teal-50 text-teal-700' : 'text-gray-500'
              }`}
            >
              {step === 1 ? 'Basic' : step === 2 ? 'Credentials' : step === 3 ? 'Pricing' : 'Personal'}
            </button>
          ))}
        </div>

        {/* Right Form Area */}
        <div className="flex-1 bg-white overflow-y-auto relative">
          {error && (
            <div className="m-4 sm:m-8 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg flex items-start gap-3">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div>
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}

          <div className="max-w-4xl mx-auto px-4 py-4 sm:px-8 sm:py-6">
            <div className="mb-4">
              <h2 className="text-xl font-bold text-gray-900">{getStepTitle()}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{getStepDescription()}</p>
            </div>

            <form id="profile-form" onSubmit={handleSubmit} className="space-y-5">

                {/* STEP 1: Basic Information */}
                {currentStep === 1 && (
                  <>
                    {/* Images Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-gray-700">Profile Banner</label>
                        <BannerImageUpload
                          currentImage={formData.bannerImage}
                          onImageUpdate={(imageUrl) => setFormData({ ...formData, bannerImage: imageUrl })}
                          onImageRemove={() => setFormData({ ...formData, bannerImage: '' })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-gray-700">Profile Picture</label>
                        <ProfileImageUpload
                          currentImage={formData.profileImage}
                          onImageUpdate={(imageUrl) => setFormData({ ...formData, profileImage: imageUrl })}
                          onImageRemove={() => setFormData({ ...formData, profileImage: '' })}
                          defaultImage="/male.png"
                        />
                      </div>
                    </div>

                    {/* Inputs Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Name */}
                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-gray-700">
                          Full Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          onFocus={() => setFocusedField('name')}
                          onBlur={() => setFocusedField(null)}
                          className={`w-full px-3 py-2 text-sm border rounded-lg transition-all duration-200 ${focusedField === 'name'
                            ? 'border-teal-500 ring-2 ring-teal-100 bg-white'
                            : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                            } focus:outline-none`}
                          placeholder="Dr. John Doe"
                          required
                        />
                      </div>

                      {/* Type */}
                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-gray-700">
                          Professional Type <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <select
                            value={formData.type}
                            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                            onFocus={() => setFocusedField('type')}
                            onBlur={() => setFocusedField(null)}
                            className={`w-full px-3 py-2 text-sm border rounded-lg appearance-none transition-all duration-200 ${focusedField === 'type'
                              ? 'border-teal-500 ring-2 ring-teal-100 bg-white'
                              : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                              } focus:outline-none cursor-pointer`}
                            required
                          >
                            <option value="">Select type</option>
                            {typeOptions.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                          <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>

                      {/* Experience */}
                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-gray-700">
                          Experience <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            value={formData.experience}
                            onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                            onFocus={() => setFocusedField('experience')}
                            onBlur={() => setFocusedField(null)}
                            className={`w-full px-3 py-2 text-sm border rounded-lg transition-all duration-200 ${focusedField === 'experience'
                              ? 'border-teal-500 ring-2 ring-teal-100 bg-white'
                              : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                              } focus:outline-none`}
                            placeholder="5"
                            min="0"
                            max="50"
                            required
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">years</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* STEP 2: Qualifications & Expertise */}
                {currentStep === 2 && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Qualification */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-gray-700">
                        Qualifications <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <select
                          onFocus={() => setFocusedField('qualification')}
                          onBlur={() => setFocusedField(null)}
                          className={`w-full px-3 py-2 text-sm border rounded-lg appearance-none transition-all duration-200 ${focusedField === 'qualification'
                            ? 'border-teal-500 ring-2 ring-teal-100 bg-white'
                            : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                            } focus:outline-none cursor-pointer`}
                          onChange={(e) => {
                            if (e.target.value) {
                              handleMultiSelect('qualification', e.target.value);
                              e.target.value = '';
                            }
                          }}
                        >
                          <option value="">Add</option>
                          {qualificationOptions.filter(opt => !formData.qualification.includes(opt)).map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </div>
                      {formData.qualification.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {formData.qualification.map(qual => (
                            <span key={qual} className="inline-flex items-center gap-1 px-2 py-1 bg-teal-50 text-teal-700 rounded-md text-xs font-medium border border-teal-200">
                              {qual}
                              <button
                                type="button"
                                onClick={() => handleMultiSelect('qualification', qual)}
                                className="ml-0.5 hover:bg-teal-200 rounded-full p-0.5 transition-colors"
                              >
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Languages */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-gray-700">
                        Languages <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <select
                          onFocus={() => setFocusedField('languages')}
                          onBlur={() => setFocusedField(null)}
                          className={`w-full px-3 py-2 text-sm border rounded-lg appearance-none transition-all duration-200 ${focusedField === 'languages'
                            ? 'border-teal-500 ring-2 ring-teal-100 bg-white'
                            : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                            } focus:outline-none cursor-pointer`}
                          onChange={(e) => {
                            if (e.target.value) {
                              handleMultiSelect('languages', e.target.value);
                              e.target.value = '';
                            }
                          }}
                        >
                          <option value="">Add</option>
                          {languageOptions.filter(opt => !formData.languages.includes(opt)).map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </div>
                      {formData.languages.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {formData.languages.map(lang => (
                            <span key={lang} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-medium border border-blue-200">
                              {lang}
                              <button
                                type="button"
                                onClick={() => handleMultiSelect('languages', lang)}
                                className="ml-0.5 hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                              >
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Specialization */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-gray-700">
                        Specializations <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <select
                          onFocus={() => setFocusedField('specialization')}
                          onBlur={() => setFocusedField(null)}
                          className={`w-full px-3 py-2 text-sm border rounded-lg appearance-none transition-all duration-200 ${focusedField === 'specialization'
                            ? 'border-teal-500 ring-2 ring-teal-100 bg-white'
                            : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                            } focus:outline-none cursor-pointer`}
                          onChange={(e) => {
                            if (e.target.value) {
                              handleMultiSelect('specialization', e.target.value);
                              e.target.value = '';
                            }
                          }}
                        >
                          <option value="">Add</option>
                          {specializationOptions.filter(opt => !formData.specialization.includes(opt)).map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </div>
                      {formData.specialization.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {formData.specialization.map(spec => (
                            <span key={spec} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 rounded-md text-xs font-medium border border-purple-200">
                              {spec}
                              <button
                                type="button"
                                onClick={() => handleMultiSelect('specialization', spec)}
                                className="ml-0.5 hover:bg-purple-200 rounded-full p-0.5 transition-colors"
                              >
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* STEP 3: Session Details */}
                {currentStep === 3 && (
                  <>
                    {/* Pricing */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Session Pricing - Video Calls (INR)
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-gray-600">20 Minutes</label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                            <input
                              type="number"
                              value={formData.price20}
                              onChange={(e) => setFormData({ ...formData, price20: e.target.value })}
                              onFocus={() => setFocusedField('price20')}
                              onBlur={() => setFocusedField(null)}
                              className={`w-full pl-8 pr-4 py-3 border rounded-xl transition-all duration-200 ${focusedField === 'price20'
                                ? 'border-teal-500 ring-4 ring-teal-100 bg-white'
                                : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                                } focus:outline-none`}
                              placeholder="500"
                              min="0"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-gray-600">40 Minutes</label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                            <input
                              type="number"
                              value={formData.price40}
                              onChange={(e) => setFormData({ ...formData, price40: e.target.value })}
                              onFocus={() => setFocusedField('price40')}
                              onBlur={() => setFocusedField(null)}
                              className={`w-full pl-8 pr-4 py-3 border rounded-xl transition-all duration-200 ${focusedField === 'price40'
                                ? 'border-teal-500 ring-4 ring-teal-100 bg-white'
                                : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                                } focus:outline-none`}
                              placeholder="1000"
                              min="0"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-gray-600">55 Minutes</label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                            <input
                              type="number"
                              value={formData.price55}
                              onChange={(e) => setFormData({ ...formData, price55: e.target.value })}
                              onFocus={() => setFocusedField('price55')}
                              onBlur={() => setFocusedField(null)}
                              className={`w-full pl-8 pr-4 py-3 border rounded-xl transition-all duration-200 ${focusedField === 'price55'
                                ? 'border-teal-500 ring-4 ring-teal-100 bg-white'
                                : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                                } focus:outline-none`}
                              placeholder="1500"
                              min="0"
                            />
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-2">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        Enter amounts in Indian Rupees (INR) without currency symbols
                      </p>
                    </div>

                    {/* Audio Pricing */}
                    <div className="space-y-2 pt-4 border-t border-gray-100">
                      <label className="block text-sm font-medium text-gray-700">
                        Session Pricing - Audio Calls (INR)
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-gray-600">20 Minutes</label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                            <input
                              type="number"
                              value={formData.audioPrice20}
                              onChange={(e) => setFormData({ ...formData, audioPrice20: e.target.value })}
                              onFocus={() => setFocusedField('audioPrice20')}
                              onBlur={() => setFocusedField(null)}
                              className={`w-full pl-8 pr-4 py-3 border rounded-xl transition-all duration-200 ${focusedField === 'audioPrice20'
                                ? 'border-teal-500 ring-4 ring-teal-100 bg-white'
                                : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                                } focus:outline-none`}
                              placeholder="300"
                              min="0"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-gray-600">40 Minutes</label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                            <input
                              type="number"
                              value={formData.audioPrice40}
                              onChange={(e) => setFormData({ ...formData, audioPrice40: e.target.value })}
                              onFocus={() => setFocusedField('audioPrice40')}
                              onBlur={() => setFocusedField(null)}
                              className={`w-full pl-8 pr-4 py-3 border rounded-xl transition-all duration-200 ${focusedField === 'audioPrice40'
                                ? 'border-teal-500 ring-4 ring-teal-100 bg-white'
                                : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                                } focus:outline-none`}
                              placeholder="600"
                              min="0"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-gray-600">55 Minutes</label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                            <input
                              type="number"
                              value={formData.audioPrice55}
                              onChange={(e) => setFormData({ ...formData, audioPrice55: e.target.value })}
                              onFocus={() => setFocusedField('audioPrice55')}
                              onBlur={() => setFocusedField(null)}
                              className={`w-full pl-8 pr-4 py-3 border rounded-xl transition-all duration-200 ${focusedField === 'audioPrice55'
                                ? 'border-teal-500 ring-4 ring-teal-100 bg-white'
                                : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                                } focus:outline-none`}
                              placeholder="900"
                              min="0"
                            />
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-2">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        Enter amounts in Indian Rupees (INR) without currency symbols
                      </p>
                    </div>

                    {/* Mode of Session - Multi-select */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Preferred Session Mode <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <select
                          onFocus={() => setFocusedField('modeOfSession')}
                          onBlur={() => setFocusedField(null)}
                          className={`w-full px-4 py-3 border rounded-xl appearance-none transition-all duration-200 ${focusedField === 'modeOfSession'
                            ? 'border-teal-500 ring-4 ring-teal-100 bg-white'
                            : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                            } focus:outline-none cursor-pointer`}
                          onChange={(e) => {
                            if (e.target.value) {
                              handleMultiSelect('modeOfSession', e.target.value);
                              e.target.value = '';
                            }
                          }}
                        >
                          <option value="">Add a session mode</option>
                          {sessionModeOptions.filter(opt => !formData.modeOfSession.includes(opt)).map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </div>
                      {formData.modeOfSession.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {formData.modeOfSession.map(mode => (
                            <span key={mode} className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-sm font-medium border border-green-200">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              {mode}
                              <button
                                type="button"
                                onClick={() => handleMultiSelect('modeOfSession', mode)}
                                className="ml-1 hover:bg-green-200 rounded-full p-0.5 transition-colors"
                                aria-label={`Remove ${mode}`}
                              >
                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* STEP 4: Personal Touch */}
                {currentStep === 4 && (
                  <>
                    {/* Quote */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 flex justify-between items-center">
                        <span>Favorite Quote</span>
                        <span className="text-xs text-gray-400 font-normal">Optional</span>
                      </label>
                      <input
                        type="text"
                        value={formData.quote}
                        onChange={(e) => setFormData({ ...formData, quote: e.target.value })}
                        onFocus={() => setFocusedField('quote')}
                        onBlur={() => setFocusedField(null)}
                        className={`w-full px-4 py-3 border rounded-xl transition-all duration-200 ${focusedField === 'quote'
                          ? 'border-teal-500 ring-4 ring-teal-100 bg-white'
                          : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                          } focus:outline-none`}
                        placeholder="Enter an inspiring quote"
                      />
                      
                      {/* Quote suggestions */}
                      <div className="mt-2">
                        <span className="text-xs text-gray-500 font-medium block mb-1.5">Or choose a suggested quote template:</span>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { text: "Who looks outside, dreams; who looks inside, awakes", author: "Carl Jung" },
                            { text: "The good life is a process, not a state of being.", author: "Carl Rogers" },
                            { text: "Although the world is full of suffering, it is also full of the overcoming of it.", author: "Helen Keller" }
                          ].map((q, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setFormData({ ...formData, quote: q.text, quoteAuthor: q.author })}
                              className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 rounded-lg text-left transition-colors font-medium text-gray-600 max-w-full sm:max-w-xs truncate"
                              title={`"${q.text}" - ${q.author}`}
                            >
                              "{q.text}"
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Quote Author */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Quote Author
                      </label>
                      <input
                        type="text"
                        value={formData.quoteAuthor}
                        onChange={(e) => setFormData({ ...formData, quoteAuthor: e.target.value })}
                        onFocus={() => setFocusedField('quoteAuthor')}
                        onBlur={() => setFocusedField(null)}
                        className={`w-full px-4 py-3 border rounded-xl transition-all duration-200 ${focusedField === 'quoteAuthor'
                          ? 'border-teal-500 ring-4 ring-teal-100 bg-white'
                          : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                          } focus:outline-none`}
                        placeholder="Author name"
                      />
                    </div>

                    {/* Introduction */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 flex justify-between items-center">
                        <span>Professional Introduction</span>
                        <span className="text-xs text-gray-400 font-normal">Optional</span>
                      </label>
                      <textarea
                        value={formData.introduction}
                        onChange={(e) => setFormData({ ...formData, introduction: e.target.value })}
                        onFocus={() => setFocusedField('introduction')}
                        onBlur={() => setFocusedField(null)}
                        className={`w-full px-4 py-3 border rounded-xl transition-all duration-200 resize-none ${focusedField === 'introduction'
                          ? 'border-teal-500 ring-4 ring-teal-100 bg-white'
                          : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                          } focus:outline-none`}
                        rows={5}
                        placeholder="Write a brief introduction about yourself, your approach to therapy, and what patients can expect from working with you..."
                        maxLength={1000}
                      />
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">This will appear on your public profile</span>
                        <span className={`font-medium ${formData.introduction.length >= 1000 ? 'text-red-500' : 'text-gray-500'}`}>
                          {formData.introduction.length}/1000 characters
                        </span>
                      </div>

                      {/* Bio templates */}
                      <div className="mt-2">
                        <span className="text-xs text-gray-500 font-medium block mb-1.5">Or choose a profile bio template:</span>
                        <div className="grid grid-cols-1 gap-2">
                          {[
                            {
                              label: "Clinical Psychologist Profile",
                              text: "I am a clinical psychologist dedicated to helping individuals navigate anxiety, depression, and life transitions. My approach is client-centered and evidence-based, creating a warm, safe, and judgment-free space to foster growth, self-awareness, and resilience."
                            },
                            {
                              label: "Counselor / Relationship Specialist",
                              text: "As a professional counselor, I specialize in relationship dynamics, stress management, and personal growth. I work collaboratively with my clients to develop practical coping strategies and build healthier communication patterns for a more fulfilling life."
                            },
                            {
                              label: "Veraawell General Therapist Bio",
                              text: "At Veraawell, we believe mental wellness is not a luxury — it's a necessity. Our mission is simple: to make professional psychological support accessible, reliable, and timely for everyone who needs it. I am here to guide you on your journey."
                            }
                          ].map((t, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setFormData({ ...formData, introduction: t.text })}
                              className="text-xs p-3 bg-gray-50 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 rounded-xl text-left transition-all font-medium text-gray-600 shadow-sm"
                            >
                              <span className="font-bold text-teal-600 block mb-1">{t.label}</span>
                              <span className="line-clamp-2 font-normal text-gray-500 leading-relaxed">{t.text}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}

            </form>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileSetupPage;
