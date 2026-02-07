import React, { useState, useEffect } from 'react';
import { API_CONFIG } from '../config/api';
import logger from '../utils/logger';

interface PreviousDoctor {
    _id: string;
    userId: {
        _id: string;
        firstName: string;
        lastName: string;
    };
    specialization: string[];
    experience: number;
    pricing: {
        min: number;
        max: number;
    };
    rating: {
        average: number;
        totalReviews: number;
    };
    profileImage?: string;
    sessionCount: number;
    lastSessionDate: string;
}

interface PreviousDoctorsSectionProps {
    onBookDoctor: (doctorId: string) => void;
}

const PreviousDoctorsSection: React.FC<PreviousDoctorsSectionProps> = ({ onBookDoctor }) => {
    const [previousDoctors, setPreviousDoctors] = useState<PreviousDoctor[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPreviousDoctors();
    }, []);

    const fetchPreviousDoctors = async () => {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}/sessions/my-doctors`, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setPreviousDoctors(data);
            }
        } catch (error) {
            logger.error('Error fetching previous doctors:', error);
        } finally {
            setLoading(false);
        }
    };

    const getDoctorImage = (doctor: PreviousDoctor) => {
        if (doctor.profileImage) {
            return doctor.profileImage;
        }
        // Use gender-based placeholder
        const firstName = doctor.userId.firstName.toLowerCase();
        const femaleNames = ['shreya', 'priya', 'anjali', 'kavya', 'divya', 'neha'];
        return femaleNames.includes(firstName) ? '/female.png' : '/male.png';
    };

    if (loading) {
        return null; // Don't show anything while loading
    }

    if (previousDoctors.length === 0) {
        return null; // Don't show section if no previous doctors
    }

    return (
        <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                Continue with Your Therapist
            </h3>

            <div className="flex gap-3 overflow-x-auto pb-2">
                {previousDoctors.map((doctor) => (
                    <div
                        key={doctor._id}
                        className="flex-shrink-0 w-48 bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow"
                    >
                        {/* Doctor Image */}
                        <div className="flex justify-center mb-3">
                            <img
                                src={getDoctorImage(doctor)}
                                alt={`Dr. ${doctor.userId.firstName}`}
                                className="w-16 h-16 rounded-full object-cover border-2 border-teal-500"
                            />
                        </div>

                        {/* Doctor Name */}
                        <h4 className="text-sm font-semibold text-gray-900 text-center mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Dr. {doctor.userId.firstName} {doctor.userId.lastName}
                        </h4>

                        {/* Rating */}
                        <div className="flex items-center justify-center gap-1 mb-2">
                            {doctor.rating.totalReviews > 0 ? (
                                <>
                                    <svg className="w-4 h-4 fill-amber-400" viewBox="0 0 20 20">
                                        <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                                    </svg>
                                    <span className="text-xs font-medium text-gray-700" style={{ fontFamily: 'Inter, sans-serif' }}>
                                        {doctor.rating.average.toFixed(1)}
                                    </span>
                                </>
                            ) : (
                                <span className="text-xs font-medium text-teal-600 bg-teal-50 px-2 py-0.5 rounded" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    New
                                </span>
                            )}
                        </div>

                        {/* Session Count */}
                        <p className="text-xs text-gray-500 text-center mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {doctor.sessionCount} {doctor.sessionCount === 1 ? 'session' : 'sessions'}
                        </p>

                        {/* Book Button */}
                        <button
                            onClick={() => onBookDoctor(doctor.userId._id)}
                            className="w-full bg-teal-600 text-white text-sm font-semibold py-2 rounded-lg hover:bg-teal-700 transition-colors"
                            style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                            Book Again
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default PreviousDoctorsSection;
