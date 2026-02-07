import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';

const PatientProfileSetupPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        fullName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
        dateOfBirth: '',
        gender: '',
        phone: '',
        emergencyContactName: '',
        emergencyContactPhone: ''
    });

    useEffect(() => {
        // Fetch existing profile if available
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}/profile/setup`, {
                credentials: 'include'
            });
            if (response.ok) {
                const data = await response.json();
                // Check if profile data exists
                if (data.success && data.profile) {
                    const profile = data.profile;
                    setFormData({
                        fullName: profile.name || `${profile.firstName || ''} ${profile.lastName || ''}`.trim(),
                        dateOfBirth: profile.dateOfBirth ? new Date(profile.dateOfBirth).toISOString().split('T')[0] : '',
                        gender: profile.gender || '',
                        phone: profile.phoneNumber || '',
                        emergencyContactName: profile.emergencyContact?.name || '',
                        emergencyContactPhone: profile.emergencyContact?.phone || ''
                    });
                }
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Validation
        if (!formData.fullName || !formData.dateOfBirth || !formData.gender || !formData.phone) {
            setError('Please fill in all required fields');
            return;
        }

        setIsSaving(true);

        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}/auth/patient-profile`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    fullName: formData.fullName,
                    dateOfBirth: formData.dateOfBirth,
                    gender: formData.gender,
                    phoneNumber: formData.phone,
                    emergencyContact: formData.emergencyContactName ? {
                        name: formData.emergencyContactName,
                        phone: formData.emergencyContactPhone
                    } : undefined
                })
            });

            if (response.ok) {
                navigate('/patient-dashboard');
            } else {
                const data = await response.json();
                setError(data.message || 'Failed to save profile');
            }
        } catch (error) {
            setError('An error occurred. Please try again.');
            console.error('Error saving profile:', error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="min-h-screen" style={{ backgroundColor: '#FAF9F6' }}>
            {/* Header */}
            <div className="bg-white border-b border-gray-200">
                <div className="max-w-3xl mx-auto px-4 py-6">
                    <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>
                        Complete Your Profile
                    </h1>
                    <p className="text-gray-600 mt-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Please provide some basic information to get started
                    </p>
                </div>
            </div>

            {/* Form */}
            <div className="max-w-3xl mx-auto px-4 py-8">
                <form onSubmit={handleSubmit} className="bg-white rounded-xl p-8 border border-gray-200">
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-red-600 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                                {error}
                            </p>
                        </div>
                    )}

                    {/* Basic Information */}
                    <div className="mb-8">
                        <h2 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Bree Serif, serif' }}>
                            Basic Information
                        </h2>

                        {/* Full Name */}
                        <div className="mb-4">
                            <label className="block text-sm font-semibold text-gray-700 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Full Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={formData.fullName}
                                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                                required
                            />
                        </div>

                        {/* Date of Birth */}
                        <div className="mb-4">
                            <label className="block text-sm font-semibold text-gray-700 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Date of Birth <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                value={formData.dateOfBirth}
                                onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                                required
                            />
                        </div>

                        {/* Gender */}
                        <div className="mb-4">
                            <label className="block text-sm font-semibold text-gray-700 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Gender <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={formData.gender}
                                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                                required
                            >
                                <option value="">Select gender</option>
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                                <option value="Other">Other</option>
                                <option value="Prefer not to say">Prefer not to say</option>
                            </select>
                        </div>

                        {/* Phone */}
                        <div className="mb-4">
                            <label className="block text-sm font-semibold text-gray-700 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Phone Number <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="tel"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                                placeholder="+91 1234567890"
                                required
                            />
                        </div>
                    </div>

                    {/* Emergency Contact (Optional) */}
                    <div className="mb-8">
                        <h2 className="text-xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Bree Serif, serif' }}>
                            Emergency Contact
                        </h2>
                        <p className="text-sm text-gray-600 mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Optional - This information helps us contact someone in case of emergency
                        </p>

                        {/* Emergency Contact Name */}
                        <div className="mb-4">
                            <label className="block text-sm font-semibold text-gray-700 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Contact Name
                            </label>
                            <input
                                type="text"
                                value={formData.emergencyContactName}
                                onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                                placeholder="e.g., John Doe"
                            />
                        </div>

                        {/* Emergency Contact Phone */}
                        <div className="mb-4">
                            <label className="block text-sm font-semibold text-gray-700 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Contact Phone
                            </label>
                            <input
                                type="tel"
                                value={formData.emergencyContactPhone}
                                onChange={(e) => setFormData({ ...formData, emergencyContactPhone: e.target.value })}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                                placeholder="+91 1234567890"
                            />
                        </div>
                    </div>

                    {/* Submit Button */}
                    <div className="flex gap-4">
                        <button
                            type="button"
                            onClick={() => navigate('/patient-dashboard')}
                            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                            style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="flex-1 px-6 py-3 text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ backgroundColor: '#0093AE', fontFamily: 'Inter, sans-serif' }}
                        >
                            {isSaving ? 'Saving...' : 'Save Profile'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default PatientProfileSetupPage;
