import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import { FiArrowLeft, FiEdit2 } from 'react-icons/fi';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import LeafDecor from '../components/ui/LeafDecor';
import EmergencyContactForm from '../components/EmergencyContactForm';
import { useRefreshPatient } from '../hooks/useEmergencyContact';
import { checkEmergencyContact, EMPTY_CONTACT } from '../utils/emergencyContact';
import type { EmergencyContactErrors, EmergencyContactValue } from '../utils/emergencyContact';
import { formatIndianPhone, isValidPhone } from '../utils/phone';
import { PLATFORM_TIMEZONE } from '../utils/dateUtils';

interface ProfileForm {
    fullName: string;
    dateOfBirth: string;
    gender: string;
    phone: string;
    contact: EmergencyContactValue;
}

/** Today's date in IST as 'YYYY-MM-DD' — the latest a date of birth can be. */
const todayIst = () => new Intl.DateTimeFormat('en-CA', { timeZone: PLATFORM_TIMEZONE }).format(new Date());

const PatientProfileSetupPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const refreshPatient = useRefreshPatient();
    const [error, setError] = useState<string | null>(null);
    const [contactErrors, setContactErrors] = useState<EmergencyContactErrors>({});
    // Editing from the start: a new patient arrives here from the welcome
    // popup's "Set up my profile", and used to find every field locked with
    // no Save button — the profile endpoint always returns an object, so the
    // page always switched to read-only.
    const [isEditing, setIsEditing] = useState(true);
    const [completed, setCompleted] = useState(false);
    const loadedRef = useRef<ProfileForm | null>(null);

    const [formData, setFormData] = useState<ProfileForm>({
        fullName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
        dateOfBirth: '',
        gender: '',
        phone: '',
        contact: EMPTY_CONTACT
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
        if (!profileData?.success || !profileData?.profile) return;
        const profile = profileData.profile;
        const loaded: ProfileForm = {
            fullName: profile.name || `${profile.firstName || ''} ${profile.lastName || ''}`.trim(),
            dateOfBirth: profile.dateOfBirth ? new Date(profile.dateOfBirth).toISOString().split('T')[0] : '',
            gender: profile.gender || '',
            phone: profile.phoneNumber || '',
            contact: {
                name: profile.emergencyContact?.name || '',
                phone: profile.emergencyContact?.phone ? formatIndianPhone(profile.emergencyContact.phone) : '',
                relationship: profile.emergencyContact?.relationship || ''
            }
        };
        const isFirstLoad = loadedRef.current === null;
        loadedRef.current = loaded;
        setCompleted(!!profile.profileCompleted);
        // Only the first load decides the mode; a refetch while someone is
        // typing must not lock the form or overwrite what they typed.
        if (isFirstLoad) {
            setFormData(loaded);
            setIsEditing(!profile.profileCompleted);
        }
    }, [profileData]);

    const profileMutation = useMutation({
        mutationFn: async (payload: Record<string, unknown>) => {
            const response = await fetch(`${API_CONFIG.BASE_URL}/auth/patient-profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.message || 'Failed to save profile');
            return data;
        },
        onSuccess: async (data: { profileCompleted?: boolean }) => {
            // The dashboard banner and the call room read the signed-in user,
            // not this page's query: refresh both, or they keep asking for an
            // emergency contact that was just given.
            await refreshPatient();
            toast.success('Profile saved');
            if (!completed && data?.profileCompleted) {
                navigate('/patient-dashboard');
                return;
            }
            setCompleted(!!data?.profileCompleted);
            setIsEditing(false);
        },
        onError: (err: Error) => {
            setError(err.message || 'An error occurred. Please try again.');
        }
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!formData.fullName.trim() || !formData.dateOfBirth || !formData.gender || !formData.phone.trim()) {
            setError('Please fill in all required fields');
            return;
        }
        if (formData.dateOfBirth > todayIst()) {
            setError('Your date of birth can’t be in the future.');
            return;
        }
        if (!isValidPhone(formData.phone)) {
            setError('Enter your phone number with 10 to 15 digits.');
            return;
        }
        const contact = checkEmergencyContact(formData.contact);
        if (!contact.ok) {
            setContactErrors(contact.errors);
            setError('Please finish the emergency contact, or clear all three of its fields.');
            return;
        }
        setContactErrors({});

        profileMutation.mutate({
            fullName: formData.fullName.trim(),
            dateOfBirth: formData.dateOfBirth,
            gender: formData.gender,
            phoneNumber: formData.phone.trim(),
            // Always sent: all three empty removes a saved contact. A blank
            // name used to send nothing, and the server kept the old contact.
            emergencyContact: contact.clear ? { name: '', phone: '', relationship: '' } : contact.contact
        });
    };

    const handleCancel = () => {
        // Cancel undoes the edit on a finished profile; on an unfinished one
        // there is nothing to go back to, so it leaves.
        if (completed && loadedRef.current) {
            setFormData(loadedRef.current);
            setError(null);
            setContactErrors({});
            setIsEditing(false);
            return;
        }
        navigate('/patient-dashboard');
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
                            <h2 className="text-white tracking-tight leading-[1.1] mb-6 font-normal" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 4vw, 42px)' }}>
                                Welcome to<br/>
                                <span>Veraawell.</span>
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
                            <h1 className="text-[28px] font-normal text-[var(--text)] tracking-tight mb-1" style={{ fontFamily: 'var(--font-display)' }}>
                                {!completed ? 'Complete your profile' : isEditing ? 'Edit profile' : 'Your profile'}
                            </h1>
                            <p className="text-[14px] text-[var(--text-2)]" style={{ fontFamily: 'var(--font-body)' }}>
                                {!completed ? 'A few details so your therapist knows who they’re talking to.' : 'Your details and emergency contact.'}
                            </p>
                        </div>
                        {!isEditing && (
                            <button
                                type="button"
                                onClick={() => setIsEditing(true)}
                                className="flex items-center gap-1.5 transition-all text-[11px] font-bold uppercase tracking-wider px-5 py-2.5 rounded-full text-[var(--teal)] bg-[var(--teal-muted)] hover:bg-[var(--teal)] hover:text-white shadow-sm"
                                style={{ fontFamily: 'var(--font-mono)' }}
                            >
                                <FiEdit2 className="w-3.5 h-3.5" />
                                Edit
                            </button>
                        )}
                    </div>

                    {/* Main Form */}
                    <form onSubmit={handleSubmit} noValidate className="flex-1 pr-2">
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
                                    <label className="block text-sm font-medium text-[var(--text-2)] mb-2">
                                        Email Address
                                    </label>
                                    <input
                                        type="email"
                                        value={user?.email || ''}
                                        disabled
                                        className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-gray-50/50 text-[var(--text-3)] text-sm cursor-not-allowed"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-[var(--text-2)] mb-2">
                                        Full Name *
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.fullName}
                                        onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                                        disabled={!isEditing}
                                        className="w-full px-4 py-3 rounded-xl border border-[var(--border)] focus:ring-2 focus:ring-[var(--teal)] focus:border-transparent outline-none transition-all bg-[var(--bg)] disabled:opacity-50 disabled:bg-gray-50/50"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-[var(--text-2)] mb-2">
                                        Date of Birth *
                                    </label>
                                    <input
                                        type="date"
                                        value={formData.dateOfBirth}
                                        onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                                        max={todayIst()}
                                        disabled={!isEditing}
                                        className="w-full px-4 py-3 rounded-xl border border-[var(--border)] focus:ring-2 focus:ring-[var(--teal)] focus:border-transparent outline-none transition-all bg-[var(--bg)] disabled:opacity-50 disabled:bg-gray-50/50"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-[var(--text-2)] mb-2">
                                        Gender *
                                    </label>
                                    <select
                                        value={formData.gender}
                                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                                        disabled={!isEditing}
                                        className="w-full px-4 py-3 rounded-xl border border-[var(--border)] focus:ring-2 focus:ring-[var(--teal)] focus:border-transparent outline-none transition-all bg-[var(--bg)] disabled:opacity-50 disabled:bg-gray-50/50 appearance-none"
                                        style={{ 
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
                                        <option value="Prefer not to say">Prefer not to say</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-[var(--text-2)] mb-2">
                                        Phone Number *
                                    </label>
                                    <input
                                        type="tel"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        disabled={!isEditing}
                                        className="w-full px-4 py-3 rounded-xl border border-[var(--border)] focus:ring-2 focus:ring-[var(--teal)] focus:border-transparent outline-none transition-all bg-[var(--bg)] disabled:opacity-50 disabled:bg-gray-50/50"
                                        placeholder="+91 98765 43210"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Divider */}
                            <div className="h-px w-full" style={{ backgroundColor: 'var(--border)' }}></div>

                            {/* Emergency Contact */}
                            <div>
                                <h3 className="text-[12px] font-bold text-[var(--text)] mb-5 tracking-widest uppercase pl-1" style={{ fontFamily: 'var(--font-mono)' }}>
                                    Emergency Contact
                                </h3>
                                <p className="text-[13px] text-[var(--text-3)] mb-5 pl-1">
                                    Needed before your first session. Only reached in an emergency.
                                </p>
                                <EmergencyContactForm
                                    value={formData.contact}
                                    onChange={(contact) => setFormData({ ...formData, contact })}
                                    errors={contactErrors}
                                    disabled={!isEditing}
                                    idPrefix="profile-ec"
                                    layout="grid"
                                    labelClassName="block text-sm font-medium text-[var(--text-2)] mb-2"
                                    inputClassName="w-full px-4 py-3 rounded-xl border border-[var(--border)] focus:ring-2 focus:ring-[var(--teal)] focus:border-transparent outline-none transition-all bg-[var(--bg)] disabled:opacity-50 disabled:bg-gray-50/50"
                                />
                            </div>
                        </div>

                        {/* Submit Area */}
                        {isEditing && (
                            <div className="mt-10 pt-8 flex gap-4 shrink-0 border-t" style={{ borderColor: 'var(--border)' }}>
                                <button
                                    type="button"
                                    onClick={handleCancel}
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
                                    {isSaving ? 'Saving…' : 'Save profile'}
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
