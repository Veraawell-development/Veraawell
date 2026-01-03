import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import DoctorCard from '../components/DoctorCard';

interface Doctor {
  _id: string;
  userId: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  specialization: string[];
  experience: number;
  qualification: string[];
  languages: string[];
  treatsFor: string[];
  pricing: {
    min: number;
    max: number;
  };
  profileImage: string;
  bio: string;
  isOnline: boolean;
  rating: {
    average: number;
    totalReviews: number;
  };
}

const ChooseProfessionalPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [onlineDoctors, setOnlineDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const serviceType = (location.state as any)?.serviceType || 'General';

  const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:5001/api'
    : 'https://veraawell-backend.onrender.com/api';

  useEffect(() => {
    fetchDoctors();
    fetchOnlineDoctors();
  }, []);

  const fetchDoctors = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/sessions/doctors`);
      if (!response.ok) {
        throw new Error('Failed to fetch doctors');
      }
      const doctorsData = await response.json();
      setDoctors(doctorsData);
      setError(null);
    } catch (error) {
      console.error('Error fetching doctors:', error);
      setError('Failed to load doctors. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchOnlineDoctors = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/doctor-status/online-doctors`);
      if (response.ok) {
        const data = await response.json();
        setOnlineDoctors(data.doctors || []);
        console.log('[ONLINE DOCTORS] Found:', data.count, 'online doctors');
      }
    } catch (error) {
      console.error('[ONLINE DOCTORS] Error fetching online doctors:', error);
      setOnlineDoctors([]);
    }
  };

  const handleBookSession = (doctorId: string, isImmediate: boolean = false) => {
    navigate(`/doctor/${doctorId}`, {
      state: {
        serviceType,
        bookingType: isImmediate ? 'immediate' : 'scheduled'
      }
    });
  };

  const getRandomBgColor = (index: number) => {
    const colors = ['#ABA5D1', '#6DBEDF', '#38ABAE'];
    return colors[index % colors.length];
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section - Simplified */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-12 md:py-16">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>
              Find Your Therapist
            </h1>
            <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-8" style={{ fontFamily: 'Inter, sans-serif' }}>
              Choose a professional who understands you. Start with a free discovery session to find the right fit.
            </p>

            {/* Discovery Session Badge */}
            <div className="inline-flex items-center gap-2 bg-teal-50 border border-teal-200 px-6 py-3 rounded-full">
              <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-semibold text-teal-700" style={{ fontFamily: 'Inter, sans-serif' }}>
                Free Discovery Session Available
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Online Doctors Section */}
      {onlineDoctors.length > 0 && (
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 py-10">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>
                  Available Now
                </h2>
              </div>
              <span className="text-sm text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
                {onlineDoctors.length} online
              </span>
            </div>

            {/* Online Doctors Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {onlineDoctors.map((doctor, index) => (
                <div
                  key={doctor._id}
                  className="bg-white border border-gray-200 rounded-xl p-5 hover:border-teal-300 hover:shadow-md transition-all"
                >
                  {/* Online Badge */}
                  <div className="flex justify-end mb-3">
                    <div className="flex items-center gap-1.5 bg-green-50 px-2.5 py-1 rounded-full">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                      <span className="text-xs font-medium text-green-700" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Online
                      </span>
                    </div>
                  </div>

                  {/* Doctor Info */}
                  <div className="text-center">
                    <div
                      className="w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center text-white text-xl font-bold"
                      style={{ backgroundColor: getRandomBgColor(index) }}
                    >
                      {doctor.firstName.charAt(0)}{doctor.lastName.charAt(0)}
                    </div>
                    <h3 className="text-base font-bold mb-1 text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>
                      Dr. {doctor.firstName} {doctor.lastName}
                    </h3>
                    <p className="text-xs text-gray-500 mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {doctor.email}
                    </p>
                    <button
                      onClick={() => handleBookSession(doctor._id, true)}
                      className="w-full px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      Book Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* All Doctors Section */}
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>
            All Professionals
          </h2>
          {!loading && !error && (
            <span className="text-sm text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
              {doctors.length} available
            </span>
          )}
        </div>

        {loading ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600 mb-3"></div>
            <p className="text-sm text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>Loading...</p>
          </div>
        ) : error ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <p className="text-red-600 mb-4 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>{error}</p>
            <button
              onClick={fetchDoctors}
              className="px-5 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Try Again
            </button>
          </div>
        ) : doctors.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {doctors.map((doctor, index) => {
              const pricingText = doctor.pricing.min === 0 && doctor.pricing.max === 0
                ? 'Not Set'
                : `₹${doctor.pricing.min} - ₹${doctor.pricing.max}`;

              const experienceText = doctor.experience === 0
                ? 'Unknown'
                : `${doctor.experience} years`;

              return (
                <DoctorCard
                  key={doctor._id}
                  name={`Dr. ${doctor.userId.firstName} ${doctor.userId.lastName}`}
                  experience={experienceText}
                  qualification={doctor.qualification.join(', ')}
                  pricing={pricingText}
                  language={doctor.languages.join(', ')}
                  treatsFor={doctor.treatsFor.join(', ')}
                  imageSrc={doctor.profileImage}
                  bgColor={getRandomBgColor(index)}
                  onBookSession={() => handleBookSession(doctor.userId._id)}
                />
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p className="text-gray-600 text-sm mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>No professionals available</p>
            <p className="text-gray-400 text-xs" style={{ fontFamily: 'Inter, sans-serif' }}>Please check back later</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChooseProfessionalPage;
