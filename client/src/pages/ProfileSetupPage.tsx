import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProfileSetupPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5001/api' 
    : 'https://veraawell-backend.onrender.com/api';

  // Form state for doctor profile
  const [formData, setFormData] = useState({
    name: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
    qualification: [] as string[],
    languages: [] as string[],
    type: '',
    experience: '',
    specialization: [] as string[],
    priceDiscovery: '',
    price30: '',
    price45: '',
    modeOfSession: '',
    quote: '',
    quoteAuthor: '',
    introduction: ''
  });

  const qualificationOptions = ['MBBS', 'MD', 'PhD', 'PsyD', 'MSc Psychology', 'MA Psychology', 'Licensed Therapist'];
  const languageOptions = ['English', 'Hindi', 'Bengali', 'Tamil', 'Telugu', 'Marathi', 'Gujarati', 'Kannada', 'Malayalam', 'Punjabi'];
  const typeOptions = ['Psychiatrist', 'Psychologist', 'Counselor', 'Therapist'];
  const specializationOptions = ['Anxiety', 'Depression', 'Stress Management', 'Relationship Issues', 'Trauma', 'PTSD', 'OCD', 'Bipolar Disorder', 'Addiction', 'Family Therapy', 'Child Psychology', 'Career Counseling'];
  const sessionModeOptions = ['Video Call', 'Audio Call', 'In-Person', 'Chat'];

  const handleMultiSelect = (field: 'qualification' | 'languages' | 'specialization', value: string) => {
    setFormData(prev => {
      const currentValues = prev[field];
      if (currentValues.includes(value)) {
        return { ...prev, [field]: currentValues.filter(v => v !== value) };
      } else {
        return { ...prev, [field]: [...currentValues, value] };
      }
    });
  };

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
            discovery: parseFloat(formData.priceDiscovery) || 0,
            session30: parseFloat(formData.price30) || 0,
            session45: parseFloat(formData.price45) || 0
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

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#E8F4F4' }}>
      {/* Header */}
      <div className="text-white py-4 px-6 flex items-center" style={{ backgroundColor: '#7DA9A7' }}>
        <button 
          onClick={() => navigate(-1)}
          className="mr-4 hover:opacity-80 p-2 rounded transition-opacity"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="text-2xl font-bold font-serif">My Profile</h1>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="bg-white rounded-lg shadow-md p-8">
          <h2 className="text-2xl font-bold text-center mb-8 font-serif" style={{ color: '#2D3748' }}>Profile Details</h2>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Name:</label>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-400 bg-gray-50"
                  placeholder="Harris Chaudhary"
                />
                <button type="button" className="text-sm font-medium" style={{ color: '#7DA9A7' }}>
                  Edit
                </button>
              </div>
            </div>

            {/* Qualification */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Qualification:</label>
              <div className="relative">
                <select
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-400 appearance-none bg-gray-50"
                  onChange={(e) => {
                    if (e.target.value) {
                      handleMultiSelect('qualification', e.target.value);
                      e.target.value = '';
                    }
                  }}
                >
                  <option value="">Select qualification...</option>
                  {qualificationOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <div className="mt-2 flex flex-wrap gap-2">
                  {formData.qualification.map(qual => (
                    <span key={qual} className="px-3 py-1 text-sm flex items-center gap-1 rounded-full" style={{ backgroundColor: '#E0F2F1', color: '#00695C' }}>
                      {qual}
                      <button
                        type="button"
                        onClick={() => handleMultiSelect('qualification', qual)}
                        className="hover:text-teal-900"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Languages */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Languages:</label>
              <div className="relative">
                <select
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent appearance-none"
                  onChange={(e) => {
                    if (e.target.value) {
                      handleMultiSelect('languages', e.target.value);
                      e.target.value = '';
                    }
                  }}
                >
                  <option value="">Select languages...</option>
                  {languageOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <div className="mt-2 flex flex-wrap gap-2">
                  {formData.languages.map(lang => (
                    <span key={lang} className="px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-sm flex items-center gap-1">
                      {lang}
                      <button
                        type="button"
                        onClick={() => handleMultiSelect('languages', lang)}
                        className="hover:text-teal-900"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Type */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Type:</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-400 appearance-none bg-gray-50"
              >
                <option value="">Select type...</option>
                {typeOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            {/* Experience */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Experience:</label>
              <input
                type="number"
                value={formData.experience}
                onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-400 bg-gray-50"
                placeholder="Years of experience"
                min="0"
              />
            </div>

            {/* Specialization */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Specialization:</label>
              <div className="relative">
                <select
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent appearance-none"
                  onChange={(e) => {
                    if (e.target.value) {
                      handleMultiSelect('specialization', e.target.value);
                      e.target.value = '';
                    }
                  }}
                >
                  <option value="">Select specialization...</option>
                  {specializationOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <div className="mt-2 flex flex-wrap gap-2">
                  {formData.specialization.map(spec => (
                    <span key={spec} className="px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-sm flex items-center gap-1">
                      {spec}
                      <button
                        type="button"
                        onClick={() => handleMultiSelect('specialization', spec)}
                        className="hover:text-teal-900"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Price Setting */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Price Setting:</label>
              <div className="grid grid-cols-3 gap-3">
                <input
                  type="number"
                  value={formData.priceDiscovery}
                  onChange={(e) => setFormData({ ...formData, priceDiscovery: e.target.value })}
                  className="px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-400 bg-gray-50 text-sm"
                  placeholder="Enter for 15 minutes Session"
                  min="0"
                />
                <input
                  type="number"
                  value={formData.price30}
                  onChange={(e) => setFormData({ ...formData, price30: e.target.value })}
                  className="px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-400 bg-gray-50 text-sm"
                  placeholder="Enter for 30 minutes Session"
                  min="0"
                />
                <input
                  type="number"
                  value={formData.price45}
                  onChange={(e) => setFormData({ ...formData, price45: e.target.value })}
                  className="px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-400 bg-gray-50 text-sm"
                  placeholder="Enter for Discovery Session (30 minutes)"
                  min="0"
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">Note: Kindly enter numbers only. Please don't use prefix such as Rs.</p>
            </div>

            {/* Mode of Session */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Mode of session:</label>
              <select
                value={formData.modeOfSession}
                onChange={(e) => setFormData({ ...formData, modeOfSession: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-400 appearance-none bg-gray-50"
              >
                <option value="">Select mode...</option>
                {sessionModeOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            {/* Quote */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Quote:</label>
              <input
                type="text"
                value={formData.quote}
                onChange={(e) => setFormData({ ...formData, quote: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-400 bg-gray-50"
                placeholder="Enter your favorite quote"
              />
            </div>

            {/* Author of Quote */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Author of Quote:</label>
              <input
                type="text"
                value={formData.quoteAuthor}
                onChange={(e) => setFormData({ ...formData, quoteAuthor: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-400 bg-gray-50"
                placeholder="Quote author"
              />
            </div>

            {/* Introduction */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Write your introduction for Profile Display:
              </label>
              <textarea
                value={formData.introduction}
                onChange={(e) => setFormData({ ...formData, introduction: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none bg-gray-50"
                rows={6}
                placeholder="Start Typing...."
                maxLength={150}
              />
              <div className="text-right text-xs text-gray-500 mt-1">
                {formData.introduction.length}/150 words
              </div>
            </div>

            {/* Submit Button */}
            <div className="text-center pt-6">
              <button
                type="submit"
                disabled={isSaving}
                className="px-12 py-3 text-white font-semibold rounded-full shadow-lg transition-all duration-300 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed font-serif"
                style={{ backgroundColor: '#7DA9A7' }}
              >
                {isSaving ? 'Saving...' : 'Launch Profile'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProfileSetupPage;
