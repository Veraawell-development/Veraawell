import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_CONFIG } from '../config/api';

interface Therapist {
    doctor: {
        _id: string;
        firstName: string;
        lastName: string;
        email: string;
    };
    profile: {
        specialization: string[];
        experience: number;
        qualification: string[];
        profileImage: string;
    } | null;
    totalSessions: number;
    completedSessions: number;
    upcomingSessions: number;
    lastSession: string | null;
    nextSession: string | null;
}

const MyTherapistPage: React.FC = () => {
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [therapists, setTherapists] = useState<Therapist[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'active' | 'past'>('all');

    useEffect(() => {
        fetchTherapists();
    }, []);

    const fetchTherapists = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${API_CONFIG.BASE_URL}/sessions/my-therapists`, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setTherapists(data);
            }
        } catch (error) {
            console.error('Error fetching therapists:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredTherapists = therapists.filter(therapist => {
        if (filter === 'active') return therapist.upcomingSessions > 0;
        if (filter === 'past') return therapist.upcomingSessions === 0 && therapist.completedSessions > 0;
        return true;
    });

    return (
        <div className="min-h-screen" style={{ backgroundColor: '#E0EAEA' }}>
            {/* Sidebar */}
            {sidebarOpen && <div className="fixed inset-0 z-40" onClick={() => setSidebarOpen(false)} />}
            <div className={`fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 shadow-lg transform transition-transform duration-300 ease-in-out z-50 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ backgroundColor: '#7DA9A8' }}>
                <div className="h-full flex flex-col p-4 text-white font-serif">
                    <div className="space-y-3">
                        <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors" onClick={() => navigate('/patient-dashboard')}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                            </svg>
                            <span className="text-base font-medium">My Dashboard</span>
                        </div>
                        <div className="flex items-center space-x-3 cursor-pointer bg-white/20 p-2 rounded-lg transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <span className="text-base font-medium">My Therapists</span>
                        </div>
                        <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors" onClick={() => navigate('/my-journal')}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                            <span className="text-base font-medium">My Journal</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Header */}
            <div className="py-4 px-4 shadow-sm" style={{ backgroundColor: '#ABA5D1' }}>
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"></path>
                        </svg>
                    </button>
                    <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Bree Serif, serif' }}>My Therapists</h1>
                    <div className="w-10"></div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-5xl mx-auto px-4 py-8">
                {/* Filter Pills */}
                <div className="flex gap-3 mb-8">
                    <button
                        onClick={() => setFilter('all')}
                        className={`px-6 py-2 rounded-full font-medium text-sm transition-all ${filter === 'all'
                            ? 'bg-white text-teal-600 shadow-md'
                            : 'bg-white/60 text-gray-600 hover:bg-white hover:shadow-sm'
                            }`}
                        style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setFilter('active')}
                        className={`px-6 py-2 rounded-full font-medium text-sm transition-all ${filter === 'active'
                            ? 'bg-white text-teal-600 shadow-md'
                            : 'bg-white/60 text-gray-600 hover:bg-white hover:shadow-sm'
                            }`}
                        style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                        Active
                    </button>
                    <button
                        onClick={() => setFilter('past')}
                        className={`px-6 py-2 rounded-full font-medium text-sm transition-all ${filter === 'past'
                            ? 'bg-white text-teal-600 shadow-md'
                            : 'bg-white/60 text-gray-600 hover:bg-white hover:shadow-sm'
                            }`}
                        style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                        Past
                    </button>
                </div>

                {/* Loading State */}
                {loading && (
                    <div className="text-center py-16">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
                        <p className="text-gray-500 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>Loading...</p>
                    </div>
                )}

                {/* Empty State */}
                {!loading && filteredTherapists.length === 0 && (
                    <div className="bg-white rounded-2xl shadow-sm p-16 text-center">
                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Bree Serif, serif' }}>
                            No therapists yet
                        </h3>
                        <p className="text-gray-500 mb-6 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Book your first session to see your therapists here
                        </p>
                        <button
                            onClick={() => navigate('/choose-professional')}
                            className="px-6 py-2.5 rounded-xl font-semibold text-white transition-all shadow-md hover:shadow-lg"
                            style={{
                                fontFamily: 'Inter, sans-serif',
                                background: 'linear-gradient(135deg, #6DBEDF 0%, #5DBEBD 100%)'
                            }}
                        >
                            Find a Therapist
                        </button>
                    </div>
                )}

                {/* Therapist Cards */}
                {!loading && filteredTherapists.length > 0 && (
                    <div className="space-y-4">
                        {filteredTherapists.map((therapist) => (
                            <div
                                key={therapist.doctor._id}
                                className="bg-white rounded-2xl shadow-md hover:shadow-lg transition-all p-6"
                            >
                                <div className="flex items-start gap-6">
                                    {/* Profile Image */}
                                    <div className="flex-shrink-0">
                                        <img
                                            src={therapist.profile?.profileImage && !therapist.profile.profileImage.includes('doctor-0')
                                                ? therapist.profile.profileImage
                                                : (therapist.doctor.firstName.toLowerCase().endsWith('a') || therapist.doctor.firstName.toLowerCase().endsWith('i') ? '/female.jpg' : '/male.jpg')
                                            }
                                            alt={`Dr. ${therapist.doctor.firstName} ${therapist.doctor.lastName}`}
                                            className="w-24 h-24 rounded-full object-cover border-4 border-teal-100"
                                        />
                                    </div>

                                    {/* Therapist Info */}
                                    <div className="flex-1">
                                        <div className="flex items-start justify-between mb-3">
                                            <div>
                                                <h3 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>
                                                    Dr. {therapist.doctor.firstName} {therapist.doctor.lastName}
                                                </h3>
                                                <p className="text-sm text-gray-600 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                    {therapist.profile?.specialization.join(', ') || 'General Practitioner'}
                                                </p>
                                            </div>
                                            <div className={`px-3 py-1 rounded-full text-xs font-semibold ${therapist.upcomingSessions > 0
                                                ? 'bg-green-100 text-green-700'
                                                : 'bg-gray-100 text-gray-600'
                                                }`} style={{ fontFamily: 'Inter, sans-serif' }}>
                                                {therapist.upcomingSessions > 0 ? '🔵 Active' : '⚪ Past'}
                                            </div>
                                        </div>

                                        {/* Stats */}
                                        <div className="grid grid-cols-3 gap-4 mb-4">
                                            <div className="text-center bg-gray-50 rounded-lg p-3">
                                                <p className="text-2xl font-bold text-teal-600" style={{ fontFamily: 'Bree Serif, serif' }}>
                                                    {therapist.totalSessions}
                                                </p>
                                                <p className="text-xs text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                    Total Sessions
                                                </p>
                                            </div>
                                            <div className="text-center bg-gray-50 rounded-lg p-3">
                                                <p className="text-2xl font-bold text-green-600" style={{ fontFamily: 'Bree Serif, serif' }}>
                                                    {therapist.completedSessions}
                                                </p>
                                                <p className="text-xs text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                    Completed
                                                </p>
                                            </div>
                                            <div className="text-center bg-gray-50 rounded-lg p-3">
                                                <p className="text-2xl font-bold text-blue-600" style={{ fontFamily: 'Bree Serif, serif' }}>
                                                    {therapist.upcomingSessions}
                                                </p>
                                                <p className="text-xs text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                    Upcoming
                                                </p>
                                            </div>
                                        </div>

                                        {/* Session Dates */}
                                        <div className="flex items-center gap-6 mb-4 text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                                            {therapist.nextSession && (
                                                <div className="flex items-center gap-2">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                    </svg>
                                                    <span>Next: {new Date(therapist.nextSession).toLocaleDateString()}</span>
                                                </div>
                                            )}
                                            {therapist.lastSession && (
                                                <div className="flex items-center gap-2">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    <span>Last: {new Date(therapist.lastSession).toLocaleDateString()}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => navigate(`/doctor-profile/${therapist.doctor._id}`)}
                                                className="flex-1 px-4 py-2 rounded-xl font-semibold bg-white border-2 border-teal-500 text-teal-600 hover:bg-teal-50 transition-all"
                                                style={{ fontFamily: 'Bree Serif, serif' }}
                                            >
                                                View Profile
                                            </button>
                                            <button
                                                onClick={() => navigate('/choose-professional')}
                                                className="flex-1 px-4 py-2 rounded-xl font-semibold text-white transition-all shadow-md hover:shadow-lg"
                                                style={{
                                                    fontFamily: 'Bree Serif, serif',
                                                    background: 'linear-gradient(135deg, #6DBEDF 0%, #5DBEBD 100%)'
                                                }}
                                            >
                                                Book Session
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MyTherapistPage;
