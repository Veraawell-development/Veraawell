import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_CONFIG } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { FiPhone, FiArrowLeft } from 'react-icons/fi';

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
        languages?: string[];
        pricing?: {
            min: number;
            max: number;
        };
        rating?: {
            average: number;
            totalReviews: number;
        };
    } | null;
    totalSessions: number;
    completedSessions: number;
    upcomingSessions: number;
    lastSession: string | null;
    nextSession: string | null;
}

const MyTherapistPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [therapists, setTherapists] = useState<Therapist[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'active' | 'past'>('all');

    const getDoctorBgColor = (id: string) => {
        const colors = ['#ABA5D1', '#7DA9A8', '#6DBEDF', '#A8D5BA'];
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
            hash = id.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % colors.length;
        return colors[index];
    };

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

    if (loading) {
        return (
            <div className="h-[calc(100vh-80px)] flex items-center justify-center bg-[#FAFAFA] font-sans">
                <div className="text-center">
                    <div className="w-8 h-8 border-2 border-[#38ABAE] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-500 text-[13px] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>Loading therapists...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen pt-[64px] md:pt-[80px] bg-[#FAFAFA] font-sans flex flex-col overflow-hidden box-border">
            <div className="flex-1 max-w-[1200px] mx-auto w-full px-6 py-8 flex flex-col min-h-0">
                
                {/* Minimal Header */}
                <div className="mb-8 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => navigate('/patient-dashboard')} 
                            className="flex items-center justify-center w-10 h-10 bg-white border border-gray-200 rounded-full text-gray-500 hover:text-[#38ABAE] hover:border-[#38ABAE] hover:shadow-sm transition-all group"
                            title="Back to Dashboard"
                        >
                            <FiArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
                        </button>
                        <h1 className="text-[24px] font-extrabold text-gray-900 tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
                            My Therapists
                        </h1>
                    </div>

                    {/* Filter Pills */}
                    <div className="flex gap-2">
                        {['all', 'active', 'past'].map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f as any)}
                                className={`px-4 py-2 rounded-full font-bold text-[11px] uppercase tracking-wider transition-all ${filter === f
                                    ? 'bg-[#38ABAE] text-white shadow-sm'
                                    : 'bg-white border border-gray-200 text-gray-500 hover:border-[#38ABAE] hover:text-[#38ABAE]'
                                    }`}
                                style={{ fontFamily: 'Inter, sans-serif' }}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Empty State */}
                {filteredTherapists.length === 0 ? (
                    <div className="bg-white rounded-[16px] border border-gray-200 shadow-sm p-16 text-center max-w-2xl mx-auto mt-4 shrink-0">
                        <div className="w-16 h-16 bg-gray-50 border border-gray-100 rounded-full flex items-center justify-center mx-auto mb-5">
                            <FiPhone className="w-6 h-6 text-gray-400" />
                        </div>
                        <h3 className="text-[18px] font-bold text-gray-800 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                            No therapists found
                        </h3>
                        <p className="text-gray-500 text-[14px] mb-8" style={{ fontFamily: 'Inter, sans-serif' }}>
                            You haven't interacted with any therapists in this category.
                        </p>
                        <button
                            onClick={() => navigate('/choose-professional')}
                            className="inline-flex items-center justify-center px-6 py-2.5 bg-[#38ABAE] text-white font-medium rounded-lg hover:bg-[#2A8285] transition-colors text-[14px]"
                            style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                            Find a Therapist
                        </button>
                    </div>
                ) : null}

                {/* Therapist Cards Layout */}
                {!loading && filteredTherapists.length > 0 && (
                    <div className="flex-1 overflow-y-auto pr-2 pb-10 custom-scrollbar min-h-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredTherapists.map((therapist) => (
                                <div
                                    key={therapist.doctor._id}
                                    className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col hover:shadow-sm hover:border-gray-300 transition-all relative overflow-hidden"
                                >
                                    {/* Doctor specific color accent */}
                                    <div className="absolute top-0 left-0 w-full h-1.5" style={{ backgroundColor: getDoctorBgColor(therapist.doctor._id) }}></div>
                                    {/* Header: Avatar, Name, Badge */}
                                    <div className="flex items-start gap-4 mb-5">
                                        <img
                                            src={therapist.profile?.profileImage && !therapist.profile.profileImage.includes('doctor-0')
                                                ? therapist.profile.profileImage
                                                : (therapist.doctor.firstName.toLowerCase().endsWith('a') || therapist.doctor.firstName.toLowerCase().endsWith('i') ? '/female.jpg' : '/male.jpg')
                                            }
                                            alt={`Dr. ${therapist.doctor.firstName} ${therapist.doctor.lastName}`}
                                            className="w-16 h-16 rounded-full object-cover border border-gray-100 shrink-0"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start gap-2">
                                                <h3 className="text-[16px] font-bold text-gray-900 truncate" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                    Dr. {therapist.doctor.firstName} {therapist.doctor.lastName}
                                                </h3>
                                                <span className="bg-[#E8F6F6] text-[#38ABAE] text-[9px] font-bold uppercase px-2 py-1 rounded shrink-0">
                                                    {therapist.upcomingSessions > 0 ? 'Your Therapist' : 'Past Therapist'}
                                                </span>
                                            </div>
                                            <p className="text-[13px] text-gray-600 mt-0.5 truncate" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                {therapist.profile?.qualification?.join(', ') || 'MA Psychology'}
                                            </p>
                                            <p className="text-[13px] font-bold text-gray-900 mt-1 flex items-center gap-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                 {therapist.profile?.rating?.average || '4.9'} <span className="text-gray-400 font-medium">({therapist.profile?.rating?.totalReviews || '19'})</span>
                                            </p>
                                        </div>
                                    </div>
                                    
                                    {/* Structured List */}
                                    <div className="space-y-2.5 mb-5 border-t border-gray-100 pt-4" style={{ fontFamily: 'Inter, sans-serif' }}>
                                        <div className="flex justify-between text-[13px]">
                                            <span className="text-gray-500">Experience</span>
                                            <span className="font-medium text-gray-900">{therapist.profile?.experience || 5} years</span>
                                        </div>
                                        <div className="flex justify-between text-[13px]">
                                            <span className="text-gray-500">Session Fee</span>
                                            <span className="font-medium text-gray-900">₹{therapist.profile?.pricing?.min || 500} - ₹{therapist.profile?.pricing?.max || 2000}</span>
                                        </div>
                                        <div className="flex justify-between text-[13px]">
                                            <span className="text-gray-500">Language</span>
                                            <span className="font-medium text-gray-900 truncate max-w-[150px] text-right">
                                                {therapist.profile?.languages?.length ? therapist.profile.languages.join(', ') : 'English, Hindi'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Expertise */}
                                    <div className="mb-6">
                                        <span className="text-[13px] text-gray-500 block mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>Expertise</span>
                                        <span className="text-[13px] font-medium text-gray-900 leading-snug line-clamp-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                                            {therapist.profile?.specialization?.length ? therapist.profile.specialization.join(', ') : 'Depression, Anxiety, Stress Management'}
                                        </span>
                                    </div>

                                    {/* Action */}
                                    <button
                                        onClick={() => navigate('/choose-professional')}
                                        className="w-full py-2.5 rounded-[8px] text-[14px] font-medium bg-[#38ABAE] text-white hover:bg-[#2A8285] transition-colors mt-auto"
                                        style={{ fontFamily: 'Inter, sans-serif' }}
                                    >
                                        Book Again
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MyTherapistPage;
