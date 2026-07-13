import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import { FiArrowLeft, FiEdit2 } from 'react-icons/fi';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import LeafDecor from '../components/ui/LeafDecor';

const PatientProfileSetupPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [error, setError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(true);
    const queryClient = useQueryClient();

    const [formData, setFormData] = useState({
        fullName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
        dateOfBirth: '',
        gender: '',
        phone: '',
        emergencyContactName: '',
        emergencyContactPhone: ''
    });

    const { data: profileData } = useQuery({
        queryKey: ['patient', 'profile', user?.userId],
        queryFn: async () => {
            const response = await fetch(`${API_CONFIG.BASE_URL}/profile/setup`, {
                credentials: 'include'
            });
            if (!response.ok) throw new Error('Failed to fetch profile');
            return response.json();
        },
        enabled: !!user
    });

    useEffect(() => {
        if (profileData?.success && profileData?.profile) {
            const profile = profileData.profile;
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
    }, [profileData]);

    const profileMutation = useMutation({
        mutationFn: async (payload: any) => {
            const response = await fetch(`${API_CONFIG.BASE_URL}/auth/patient-profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Failed to save profile');
            }
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['patient', 'profile', user?.userId] });
            toast.success('Profile saved successfully');
            navigate('/patient-dashboard');
        },
        onError: (err: any) => {
            setError(err.message || 'An error occurred. Please try again.');
            console.error('Error saving profile:', err);
        }
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!formData.fullName || !formData.dateOfBirth || !formData.gender || !formData.phone) {
            setError('Please fill in all required fields');
            return;
        }

        profileMutation.mutate({
            fullName: formData.fullName,
            dateOfBirth: formData.dateOfBirth,
            gender: formData.gender,
            phoneNumber: formData.phone,
            emergencyContact: formData.emergencyContactName ? {
                name: formData.emergencyContactName,
                phone: formData.emergencyContactPhone
            } : undefined
        });
    };

    const isSaving = profileMutation.isPending;

    return (
        <div className="min-h-screen pt-32 pb-12 relative overflow-hidden font-sans flex justify-center px-4 md:px-8" style={{ backgroundColor: 'var(--bg)' }}>
            
            {/* Background Ambient Decor (From Landing Page) */}
            <LeafDecor className="absolute -top-20 -left-20 text-[var(--teal)] opacity-5 rotate-45 transform scale-150 pointer-events-none" />
            <LeafDecor className="absolute top-1/2 -right-32 text-[var(--teal)] opacity-5 -rotate-90 transform scale-[2] pointer-events-none" />
            
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[var(--teal-muted)] rounded-full mix-blend-multiply filter blur-[100px] opacity-40 transform translate-x-1/2 -translate-y-1/2 z-0 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-[var(--coral-muted)] rounded-full mix-blend-multiply filter blur-[120px] opacity-20 transform -translate-x-1/3 translate-y-1/3 z-0 pointer-events-none" />

            {/* Main Split Card (Bento Style) */}
            <div className="w-full max-w-[1700px] bg-[var(--surface)] rounded-[40px] shadow-2xl overflow-hidden flex flex-col md:flex-row border border-[var(--border)] relative z-10 min-h-[80vh]">
                
                {/* Left Side: Premium Branding Panel */}
                <div className="hidden md:flex w-[40%] p-12 lg:p-14 flex-col relative overflow-hidden" style={{ backgroundColor: 'var(--teal)' }}>
                    {/* Abstract Floating Shapes & Leaf Decor */}
                    <LeafDecor className="absolute -bottom-32 -left-32 text-white opacity-[0.06] transform scale-[3] rotate-12 pointer-events-none" />
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full filter blur-[80px] opacity-10 transform translate-x-1/3 -translate-y-1/3 pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-black rounded-full filter blur-[100px] opacity-20 transform -translate-x-1/3 translate-y-1/3 pointer-events-none" />

                    <div className="relative z-10 flex flex-col h-full justify-between">
                        {/* Star Logo Mark */}
                        <div>
                            <div className="w-12 h-12 bg-white rounded-[16px] flex items-center justify-center shadow-lg transform hover:scale-105 transition-transform mb-16">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="var(--teal)" />
                                </svg>
                            </div>
                            <h2 className="text-white tracking-tight leading-[1.1] mb-6" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 4vw, 42px)' }}>
                                Welcome to<br/>
                                <span>Veerawell.</span>
                            </h2>
                            <div className="w-16 h-1 bg-white/30 mb-8 rounded-full"></div>
                            <p className="text-white/80 text-[16px] leading-relaxed font-light max-w-[280px]" style={{ fontFamily: 'var(--font-body)' }}>
                                We are designing a personalized mental wellness journey exclusively for you. Let's complete your profile to begin.
                            </p>
                        </div>

                        {/* Minimal Footer Anchor */}
                        <div>
                            <p className="text-[11px] text-white/60 font-bold tracking-[0.2em] uppercase" style={{ fontFamily: 'var(--font-mono)' }}>
                                Encrypted & Private
                            </p>
                        </div>
                    </div>
                </div>

                {/* Right Side: Form */}
                <div className="flex-1 p-8 md:p-12 lg:p-16 flex flex-col bg-[var(--surface)] relative z-10 overflow-y-auto">
                    
                    {/* Header */}
                    <div className="mb-10 flex items-start justify-between shrink-0">
                        <div>
                            <button 
                                onClick={() => navigate('/patient-dashboard')} 
                                className="flex items-center gap-2 text-[11px] font-bold text-[var(--text-3)] hover:text-[var(--teal)] transition-colors mb-4 group tracking-[0.1em] uppercase"
                                style={{ fontFamily: 'var(--font-mono)' }}
                            >
                                <FiArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
                                Dashboard
                            </button>
                            <h1 className="text-[28px] font-bold text-[var(--text)] tracking-tight mb-1" style={{ fontFamily: 'var(--font-display)' }}>
                                Complete Profile
                            </h1>
                            <p className="text-[14px] text-[var(--text-2)]" style={{ fontFamily: 'var(--font-body)' }}>
                                Please provide your basic information.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsEditing(true)}
                            disabled={isEditing}
                            className={`flex items-center gap-1.5 transition-all text-[11px] font-bold uppercase tracking-wider px-5 py-2.5 rounded-full ${isEditing ? 'text-[var(--text-3)] bg-[var(--border)] opacity-50 cursor-not-allowed' : 'text-[var(--teal)] bg-[var(--teal-muted)] hover:bg-[var(--teal)] hover:text-white shadow-sm'}`}
                            style={{ fontFamily: 'var(--font-mono)' }}
                        >
                            <FiEdit2 className="w-3.5 h-3.5" />
                            Edit
                        </button>
                    </div>

                    {/* Main Form */}
                    <form onSubmit={handleSubmit} className="flex-1 pr-2">
                        {error && (
                            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-2 shrink-0">
                                <p className="text-red-600 text-[13px] font-medium">
                                    {error}
                                </p>
                            </div>
                        )}

                        <div className="space-y-8">
                            {/* Basic Info */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6">
                                <div>
                                    <label className="block text-[11px] font-bold text-[var(--text-3)] mb-2 uppercase tracking-widest pl-2" style={{ fontFamily: 'var(--font-mono)' }}>
                                        Full Name <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.fullName}
                                        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                        disabled={!isEditing}
                                        className="w-full px-5 py-3.5 bg-[var(--bg)] border shadow-sm rounded-full text-[14px] font-medium text-[var(--text)] transition-all focus:outline-none focus:border-[var(--teal)] focus:ring-4 focus:ring-[var(--teal-muted)] disabled:opacity-50 disabled:bg-gray-50/50"
                                        style={{ borderColor: 'var(--border)' }}
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-[11px] font-bold text-[var(--text-3)] mb-2 uppercase tracking-widest pl-2" style={{ fontFamily: 'var(--font-mono)' }}>
                                        Date of Birth <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        value={formData.dateOfBirth}
                                        onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                                        disabled={!isEditing}
                                        className="w-full px-5 py-3.5 bg-[var(--bg)] border shadow-sm rounded-full text-[14px] font-medium text-[var(--text)] transition-all focus:outline-none focus:border-[var(--teal)] focus:ring-4 focus:ring-[var(--teal-muted)] disabled:opacity-50 disabled:bg-gray-50/50"
                                        style={{ borderColor: 'var(--border)' }}
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-[11px] font-bold text-[var(--text-3)] mb-2 uppercase tracking-widest pl-2" style={{ fontFamily: 'var(--font-mono)' }}>
                                        Gender <span className="text-red-400">*</span>
                                    </label>
                                    <select
                                        value={formData.gender}
                                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                                        disabled={!isEditing}
                                        className="w-full px-5 py-3.5 bg-[var(--bg)] border shadow-sm rounded-full text-[14px] font-medium text-[var(--text)] transition-all focus:outline-none focus:border-[var(--teal)] focus:ring-4 focus:ring-[var(--teal-muted)] appearance-none disabled:opacity-50 disabled:bg-gray-50/50"
                                        style={{ 
                                            borderColor: 'var(--border)',
                                            backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%24%2024%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M6%209L12%2015L18%209%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E")',
                                            backgroundRepeat: 'no-repeat',
                                            backgroundPosition: 'right 1rem center'
                                        }}
                                        required
                                    >
                                        <option value="" disabled>Select</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-bold text-[var(--text-3)] mb-2 uppercase tracking-widest pl-2" style={{ fontFamily: 'var(--font-mono)' }}>
                                        Phone Number <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="tel"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        disabled={!isEditing}
                                        className="w-full px-5 py-3.5 bg-[var(--bg)] border shadow-sm rounded-full text-[14px] font-medium text-[var(--text)] transition-all focus:outline-none focus:border-[var(--teal)] focus:ring-4 focus:ring-[var(--teal-muted)] disabled:opacity-50 disabled:bg-gray-50/50"
                                        style={{ borderColor: 'var(--border)' }}
                                        placeholder="+91 1234567890"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Divider */}
                            <div className="h-px w-full" style={{ backgroundColor: 'var(--border)' }}></div>

                            {/* Emergency Contact */}
                            <div>
                                <h3 className="text-[12px] font-bold text-[var(--text)] mb-5 tracking-widest uppercase pl-1" style={{ fontFamily: 'var(--font-mono)' }}>
                                    Emergency Contact <span className="text-[var(--text-3)] font-medium normal-case ml-1 tracking-normal">(Optional)</span>
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6">
                                    <div>
                                        <label className="block text-[11px] font-bold text-[var(--text-3)] mb-2 uppercase tracking-widest pl-2" style={{ fontFamily: 'var(--font-mono)' }}>
                                            Name
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.emergencyContactName}
                                            onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })}
                                            disabled={!isEditing}
                                            className="w-full px-5 py-3.5 bg-[var(--bg)] border shadow-sm rounded-full text-[14px] font-medium text-[var(--text)] transition-all focus:outline-none focus:border-[var(--teal)] focus:ring-4 focus:ring-[var(--teal-muted)] disabled:opacity-50 disabled:bg-gray-50/50"
                                            style={{ borderColor: 'var(--border)' }}
                                            placeholder="Jane Doe"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-[var(--text-3)] mb-2 uppercase tracking-widest pl-2" style={{ fontFamily: 'var(--font-mono)' }}>
                                            Phone
                                        </label>
                                        <input
                                            type="tel"
                                            value={formData.emergencyContactPhone}
                                            onChange={(e) => setFormData({ ...formData, emergencyContactPhone: e.target.value })}
                                            disabled={!isEditing}
                                            className="w-full px-5 py-3.5 bg-transparent border rounded-full text-[14px] font-medium text-[var(--text)] transition-all focus:outline-none focus:border-[var(--teal)] focus:ring-4 focus:ring-[var(--teal-muted)] disabled:opacity-50 disabled:bg-gray-50/50"
                                            style={{ borderColor: 'var(--border)' }}
                                            placeholder="+91 1234567890"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Submit Area */}
                        {isEditing && (
                            <div className="mt-10 pt-8 flex gap-4 shrink-0 border-t" style={{ borderColor: 'var(--border)' }}>
                                <button
                                    type="button"
                                    onClick={() => navigate('/patient-dashboard')}
                                    className="px-8 py-3.5 bg-transparent border rounded-full font-bold text-[13px] hover:bg-[var(--bg)] transition-colors"
                                    style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="flex-1 px-8 py-3.5 bg-[var(--teal)] text-white rounded-full font-bold text-[14px] hover:shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
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
