import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import { FiArrowLeft, FiEdit2 } from 'react-icons/fi';

const PatientProfileSetupPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(true);

    const [formData, setFormData] = useState({
        fullName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
        dateOfBirth: '',
        gender: '',
        phone: '',
        emergencyContactName: '',
        emergencyContactPhone: ''
    });

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}/profile/setup`, {
                credentials: 'include'
            });
            if (response.ok) {
                const data = await response.json();
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
                    setIsEditing(false);
                }
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

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
        <div className="h-screen pt-[64px] md:pt-[80px] bg-[#FAFAFA] font-sans selection:bg-teal-100 flex items-center justify-center p-4 md:p-8 box-border">
            <div className="w-full max-w-[1000px] bg-white rounded-[24px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.06)] overflow-hidden flex flex-col md:flex-row max-h-[100%] border border-gray-100">
                
                {/* Left Side: Premium Branding */}
                <div className="hidden md:flex w-[42%] bg-teal-600 p-12 flex-col relative overflow-hidden">
                    {/* Massive Abstract Geometric Background (Veerawell Flower interpretation) */}
                    <svg className="absolute -bottom-24 -left-24 w-96 h-96 text-white opacity-[0.03] rotate-45" viewBox="0 0 100 100" fill="currentColor">
                        <path d="M50 0C50 27.6 27.6 50 0 50C27.6 50 50 72.4 50 100C50 72.4 72.4 50 100 50C72.4 50 50 27.6 50 0Z" />
                        <circle cx="50" cy="50" r="15" />
                    </svg>
                    <svg className="absolute -top-12 -right-12 w-64 h-64 text-white opacity-[0.02]" viewBox="0 0 100 100" fill="currentColor">
                        <path d="M50 0C50 27.6 27.6 50 0 50C27.6 50 50 72.4 50 100C50 72.4 50 50 27.6 50 0Z" />
                    </svg>

                    <div className="relative z-10 flex flex-col h-full">
                        {/* Minimal Logo Mark */}
                        <div className="mb-16">
                            <div className="w-10 h-10 bg-white rounded-[12px] flex items-center justify-center shadow-sm">
                                <svg className="w-5 h-5 text-teal-600" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2C12 7.52 7.52 12 2 12C7.52 12 12 16.48 12 22C12 16.48 16.48 12 22 12C16.48 12 12 7.52 12 2Z" />
                                </svg>
                            </div>
                        </div>

                        <div className="mt-auto mb-auto">
                            <h2 className="text-[40px] text-white tracking-tight leading-[1.1] mb-6" style={{ fontFamily: 'Inter, sans-serif' }}>
                                <span className="font-light text-teal-100">Welcome to</span><br/>
                                <span className="font-bold">Veerawell.</span>
                            </h2>
                            <div className="w-12 h-1 bg-teal-400 mb-6 rounded-full"></div>
                            <p className="text-teal-50/80 text-[15px] leading-relaxed font-light max-w-[260px]">
                                We are designing a personalized mental wellness journey exclusively for you. Let's complete your profile to begin.
                            </p>
                        </div>

                        {/* Minimal Footer Anchor */}
                        <div className="mt-auto">
                            <p className="text-[12px] text-teal-200/60 font-medium tracking-widest uppercase">
                                Encrypted & Private
                            </p>
                        </div>
                    </div>
                </div>

                {/* Right Side: Form */}
                <div className="flex-1 p-8 md:p-12 lg:p-14 flex flex-col max-h-[100%] bg-white relative">
                    
                    {/* Header */}
                    <div className="mb-10 flex items-start justify-between shrink-0">
                        <div>
                            <button 
                                onClick={() => navigate('/patient-dashboard')} 
                                className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 hover:text-teal-600 transition-colors mb-3 group tracking-wide uppercase"
                                aria-label="Back to Dashboard"
                            >
                                <FiArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
                                Dashboard
                            </button>
                            <h1 className="text-[22px] font-extrabold text-gray-900 tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Complete Profile
                            </h1>
                            <p className="text-[13px] text-gray-400 mt-1 font-medium">
                                Please provide your basic information.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsEditing(true)}
                            disabled={isEditing}
                            className={`flex items-center gap-1.5 transition-colors text-[10px] font-bold uppercase tracking-wider px-4 py-2 rounded-full ${isEditing ? 'text-gray-300 bg-gray-50 cursor-not-allowed' : 'text-teal-700 bg-teal-50 hover:bg-teal-100'}`}
                        >
                            <FiEdit2 className="w-3 h-3" />
                            Edit
                        </button>
                    </div>

                    {/* Main Form */}
                    <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pr-2">
                        {error && (
                            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-2 shrink-0">
                                <p className="text-red-600 text-[12px] font-medium">
                                    {error}
                                </p>
                            </div>
                        )}

                        <div className="space-y-7">
                            {/* Basic Info */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-5">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-widest pl-1">
                                        Full Name <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.fullName}
                                        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                        disabled={!isEditing}
                                        className="w-full px-5 py-3 bg-gray-50/50 border border-gray-200/80 rounded-full text-[13px] font-medium text-gray-800 transition-all focus:outline-none focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 disabled:bg-gray-50 disabled:text-gray-400"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-widest pl-1">
                                        Date of Birth <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        value={formData.dateOfBirth}
                                        onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                                        disabled={!isEditing}
                                        className="w-full px-5 py-3 bg-gray-50/50 border border-gray-200/80 rounded-full text-[13px] font-medium text-gray-800 transition-all focus:outline-none focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 disabled:bg-gray-50 disabled:text-gray-400"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-widest pl-1">
                                        Gender <span className="text-red-400">*</span>
                                    </label>
                                    <select
                                        value={formData.gender}
                                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                                        disabled={!isEditing}
                                        className="w-full px-5 py-3 bg-gray-50/50 border border-gray-200/80 rounded-full text-[13px] font-medium text-gray-800 transition-all focus:outline-none focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 appearance-none bg-no-repeat bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%24%2024%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M6%209L12%2015L18%209%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_1rem_center] disabled:bg-gray-50 disabled:text-gray-400"
                                        required
                                    >
                                        <option value="" disabled>Select</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-widest pl-1">
                                        Phone Number <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="tel"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        disabled={!isEditing}
                                        className="w-full px-5 py-3 bg-gray-50/50 border border-gray-200/80 rounded-full text-[13px] font-medium text-gray-800 transition-all focus:outline-none focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 disabled:bg-gray-50 disabled:text-gray-400"
                                        placeholder="+91 1234567890"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Divider */}
                            <div className="h-px w-full bg-gray-50"></div>

                            {/* Emergency Contact */}
                            <div>
                                <h3 className="text-[11px] font-bold text-gray-900 mb-3 tracking-widest uppercase pl-1">Emergency Contact <span className="text-gray-400 font-medium normal-case text-[11px] ml-1 tracking-normal">(Optional)</span></h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-5">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-widest pl-1">
                                            Name
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.emergencyContactName}
                                            onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })}
                                            disabled={!isEditing}
                                            className="w-full px-5 py-3 bg-gray-50/50 border border-gray-200/80 rounded-full text-[13px] font-medium text-gray-800 transition-all focus:outline-none focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 disabled:bg-gray-50 disabled:text-gray-400"
                                            placeholder="Jane Doe"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-widest pl-1">
                                            Phone
                                        </label>
                                        <input
                                            type="tel"
                                            value={formData.emergencyContactPhone}
                                            onChange={(e) => setFormData({ ...formData, emergencyContactPhone: e.target.value })}
                                            disabled={!isEditing}
                                            className="w-full px-5 py-3 bg-gray-50/50 border border-gray-200/80 rounded-full text-[13px] font-medium text-gray-800 transition-all focus:outline-none focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 disabled:bg-gray-50 disabled:text-gray-400"
                                            placeholder="+91 1234567890"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Submit Area */}
                        {isEditing && (
                            <div className="mt-8 pt-6 flex gap-4 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => navigate('/patient-dashboard')}
                                    className="px-8 py-3 bg-white border border-gray-200 text-gray-600 rounded-full font-bold text-[13px] hover:bg-gray-50 hover:text-gray-900 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="flex-1 px-8 py-3 bg-teal-600 text-white rounded-full font-bold text-[13px] hover:bg-teal-700 transition-all shadow-[0_4px_14px_rgba(13,148,136,0.25)] hover:shadow-[0_6px_20px_rgba(13,148,136,0.35)] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                                >
                                    {isSaving ? 'Saving...' : 'Save Profile'}
                                </button>
                            </div>
                        )}
                    </form>
                </div>
            </div>
        </div>
    );
};

export default PatientProfileSetupPage;
