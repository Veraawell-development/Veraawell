import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ProfileImageUpload from '../components/ProfileImageUpload';

const ProfileSetupPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;

  const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:5001/api'
    : 'https://veraawell-backend.onrender.com/api';

  // Form state for doctor profile
  const [formData, setFormData] = useState({
    name: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
    profileImage: '',
    qualification: [] as string[],
    languages: [] as string[],
    type: '',
    experience: '',
    specialization: [] as string[],
    price20: '',
    price40: '',
    price55: '',
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
        const response = await fetch(`${API_BASE_URL}/profile/setup`, {
          method: 'GET',
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          if (data.profile) {
            setFormData({
              name: data.profile.name || `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
              profileImage: data.profile.profileImage || '',
              qualification: data.profile.qualification || [],
              languages: data.profile.languages || [],
              type: data.profile.type || '',
              experience: data.profile.experience || '',
              specialization: data.profile.specialization || [],
              price20: data.profile.price20 || '',
              price40: data.profile.price40 || '',
              price55: data.profile.price55 || '',
              // Ensure modeOfSession is always an array (handle legacy string data)
              modeOfSession: Array.isArray(data.profile.modeOfSession)
                ? data.profile.modeOfSession
                : (data.profile.modeOfSession ? [data.profile.modeOfSession] : []),
              quote: data.profile.quote || '',
              quoteAuthor: data.profile.quoteAuthor || '',
              introduction: data.profile.introduction || ''
            });
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
            session55: parseFloat(formData.price55) || 0
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to save profile');
      }

      // Redirect to dashboard after successful save
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col">
      {/* Modern Header */}
      <div className="sticky top-0 z-10 backdrop-blur-md bg-white/80 border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Go back"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Profile Setup</h1>
                <p className="text-sm text-gray-500">Step {currentStep} of {totalSteps}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2" />
              </svg>
              <span>5-10 min</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-6 flex items-center gap-2">
            {[1, 2, 3, 4].map((step) => (
              <div key={step} className="flex-1 flex flex-col items-center gap-2">
                <div className={`w-full h-2 rounded-full transition-all duration-300 ${step <= currentStep ? 'bg-teal-500' : 'bg-gray-200'
                  }`} />
                <span className={`text-xs font-medium ${step <= currentStep ? 'text-teal-600' : 'text-gray-400'
                  }`}>
                  {step === 1 && 'Basic'}
                  {step === 2 && 'Credentials'}
                  {step === 3 && 'Pricing'}
                  {step === 4 && 'Personal'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 flex-1 flex flex-col max-h-[calc(100vh-280px)]">

          {error && (
            <div className="mx-8 mt-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg flex items-start gap-3">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div>
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
            {/* Step Header */}
            <div className="px-8 pt-8 pb-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${currentStep === 1 ? 'bg-teal-100' :
                  currentStep === 2 ? 'bg-blue-100' :
                    currentStep === 3 ? 'bg-green-100' :
                      'bg-amber-100'
                  }`}>
                  {currentStep === 1 && (
                    <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  )}
                  {currentStep === 2 && (
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                  )}
                  {currentStep === 3 && (
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  {currentStep === 4 && (
                    <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  )}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{getStepTitle()}</h2>
                  <p className="text-sm text-gray-500 mt-1">{getStepDescription()}</p>
                </div>
              </div>
            </div>

            {/* Step Content - Scrollable if needed */}
            <div className="flex-1 overflow-y-auto px-8 py-6">
              <div className="space-y-6 max-w-2xl">

                {/* STEP 1: Basic Information */}
                {currentStep === 1 && (
                  <>
                    {/* Profile Image Upload */}
                    <div className="flex justify-center mb-8">
                      <ProfileImageUpload
                        currentImage={formData.profileImage}
                        onImageUpdate={(imageUrl) => setFormData({ ...formData, profileImage: imageUrl })}
                        onImageRemove={() => setFormData({ ...formData, profileImage: '' })}
                        defaultImage="/male.png"
                      />
                    </div>

                    {/* Name */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        onFocus={() => setFocusedField('name')}
                        onBlur={() => setFocusedField(null)}
                        className={`w-full px-4 py-3 border rounded-xl transition-all duration-200 ${focusedField === 'name'
                          ? 'border-teal-500 ring-4 ring-teal-100 bg-white'
                          : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                          } focus:outline-none`}
                        placeholder="Dr. John Doe"
                        required
                      />
                    </div>

                    {/* Type */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Professional Type <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <select
                          value={formData.type}
                          onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                          onFocus={() => setFocusedField('type')}
                          onBlur={() => setFocusedField(null)}
                          className={`w-full px-4 py-3 border rounded-xl appearance-none transition-all duration-200 ${focusedField === 'type'
                            ? 'border-teal-500 ring-4 ring-teal-100 bg-white'
                            : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                            } focus:outline-none cursor-pointer`}
                          required
                        >
                          <option value="">Select your professional type</option>
                          {typeOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* Experience */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Years of Experience <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={formData.experience}
                          onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                          onFocus={() => setFocusedField('experience')}
                          onBlur={() => setFocusedField(null)}
                          className={`w-full px-4 py-3 border rounded-xl transition-all duration-200 ${focusedField === 'experience'
                            ? 'border-teal-500 ring-4 ring-teal-100 bg-white'
                            : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                            } focus:outline-none`}
                          placeholder="e.g., 5"
                          min="0"
                          max="50"
                          required
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">years</span>
                      </div>
                    </div>
                  </>
                )}

                {/* STEP 2: Qualifications & Expertise */}
                {currentStep === 2 && (
                  <>
                    {/* Qualification */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Qualifications <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <select
                          onFocus={() => setFocusedField('qualification')}
                          onBlur={() => setFocusedField(null)}
                          className={`w-full px-4 py-3 border rounded-xl appearance-none transition-all duration-200 ${focusedField === 'qualification'
                            ? 'border-teal-500 ring-4 ring-teal-100 bg-white'
                            : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                            } focus:outline-none cursor-pointer`}
                          onChange={(e) => {
                            if (e.target.value) {
                              handleMultiSelect('qualification', e.target.value);
                              e.target.value = '';
                            }
                          }}
                        >
                          <option value="">Add a qualification</option>
                          {qualificationOptions.filter(opt => !formData.qualification.includes(opt)).map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </div>
                      {formData.qualification.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {formData.qualification.map(qual => (
                            <span key={qual} className="inline-flex items-center gap-2 px-3 py-1.5 bg-teal-50 text-teal-700 rounded-lg text-sm font-medium border border-teal-200">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                              {qual}
                              <button
                                type="button"
                                onClick={() => handleMultiSelect('qualification', qual)}
                                className="ml-1 hover:bg-teal-200 rounded-full p-0.5 transition-colors"
                                aria-label={`Remove ${qual}`}
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

                    {/* Languages */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Languages Spoken <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <select
                          onFocus={() => setFocusedField('languages')}
                          onBlur={() => setFocusedField(null)}
                          className={`w-full px-4 py-3 border rounded-xl appearance-none transition-all duration-200 ${focusedField === 'languages'
                            ? 'border-teal-500 ring-4 ring-teal-100 bg-white'
                            : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                            } focus:outline-none cursor-pointer`}
                          onChange={(e) => {
                            if (e.target.value) {
                              handleMultiSelect('languages', e.target.value);
                              e.target.value = '';
                            }
                          }}
                        >
                          <option value="">Add a language</option>
                          {languageOptions.filter(opt => !formData.languages.includes(opt)).map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </div>
                      {formData.languages.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {formData.languages.map(lang => (
                            <span key={lang} className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium border border-blue-200">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                              </svg>
                              {lang}
                              <button
                                type="button"
                                onClick={() => handleMultiSelect('languages', lang)}
                                className="ml-1 hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                                aria-label={`Remove ${lang}`}
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

                    {/* Specialization */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Areas of Specialization <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <select
                          onFocus={() => setFocusedField('specialization')}
                          onBlur={() => setFocusedField(null)}
                          className={`w-full px-4 py-3 border rounded-xl appearance-none transition-all duration-200 ${focusedField === 'specialization'
                            ? 'border-teal-500 ring-4 ring-teal-100 bg-white'
                            : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                            } focus:outline-none cursor-pointer`}
                          onChange={(e) => {
                            if (e.target.value) {
                              handleMultiSelect('specialization', e.target.value);
                              e.target.value = '';
                            }
                          }}
                        >
                          <option value="">Add a specialization</option>
                          {specializationOptions.filter(opt => !formData.specialization.includes(opt)).map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </div>
                      {formData.specialization.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {formData.specialization.map(spec => (
                            <span key={spec} className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-sm font-medium border border-purple-200">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                                <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9.707 5.707a1 1 0 00-1.414-1.414L9 12.586l-1.293-1.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                              {spec}
                              <button
                                type="button"
                                onClick={() => handleMultiSelect('specialization', spec)}
                                className="ml-1 hover:bg-purple-200 rounded-full p-0.5 transition-colors"
                                aria-label={`Remove ${spec}`}
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

                {/* STEP 3: Session Details */}
                {currentStep === 3 && (
                  <>
                    {/* Pricing */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Session Pricing (INR)
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
                      <label className="block text-sm font-medium text-gray-700">
                        Favorite Quote
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
                      <label className="block text-sm font-medium text-gray-700">
                        Professional Introduction
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
                        maxLength={150}
                      />
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">This will appear on your public profile</span>
                        <span className={`font-medium ${formData.introduction.length >= 150 ? 'text-red-500' : 'text-gray-500'}`}>
                          {formData.introduction.length}/150 characters
                        </span>
                      </div>
                    </div>
                  </>
                )}

              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="px-8 py-6 border-t border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={handlePrevious}
                  disabled={currentStep === 1}
                  className="px-6 py-3 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Previous
                </button>

                <div className="flex items-center gap-3">
                  {currentStep < totalSteps ? (
                    <button
                      type="button"
                      onClick={handleNext}
                      disabled={!canProceed()}
                      className="px-8 py-3 bg-gradient-to-r from-teal-500 to-teal-600 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center gap-2"
                    >
                      Next Step
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-8 py-3 bg-gradient-to-r from-teal-500 to-teal-600 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center gap-2"
                    >
                      {isSaving ? (
                        <>
                          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Complete Setup</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Validation hint */}
              {!canProceed() && currentStep < totalSteps && (
                <p className="text-sm text-amber-600 mt-3 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  Please fill in all required fields to continue
                </p>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProfileSetupPage;
