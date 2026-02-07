import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import DoctorCard from '../components/DoctorCard';
import { API_CONFIG } from '../config/api';

interface Doctor {
  _id: string;
  userId: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    gender?: string;
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
  gender?: string;
}

const ChooseProfessionalPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [onlineDoctors, setOnlineDoctors] = useState<any[]>([]);
  const [previousDoctorIds, setPreviousDoctorIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'online' | 'all'>('online');

  const serviceType = (location.state as any)?.serviceType || 'General';

  const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:5001/api'
    : 'https://veraawell-backend.onrender.com/api';

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchDoctors(),
        fetchOnlineDoctors(),
        fetchPreviousDoctors()
      ]);
      setLoading(false);
    };
    loadData();
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

  const fetchPreviousDoctors = async () => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/sessions/my-doctors`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        // Store IDs of previous doctors (using DoctorProfile _id)
        setPreviousDoctorIds(new Set(data.map((d: any) => d._id)));
      }
    } catch (error) {
      console.error('Error fetching previous doctors:', error);
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

  const getDoctorBgColor = (id: string) => {
    const colors = ['#ABA5D1', '#7DA9A8', '#6DBEDF', '#A8D5BA'];
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  // Helper function to get gender-based image
  const getDoctorImage = (doctor: any) => {
    // Check if doctor has a valid profile image (not default/placeholder/old SVG)
    if (doctor.profileImage &&
      doctor.profileImage !== '/default-doctor.png' &&
      !doctor.profileImage.includes('doctor-0') &&
      !doctor.profileImage.includes('doctor-placeholder')) {
      return doctor.profileImage;
    }

    // Use name-based detection since backend doesn't have gender field
    const firstName = (doctor.userId?.firstName || doctor.firstName || '').toLowerCase();

    // Common female names and patterns
    const femaleNames = [
      'shreya', 'priya', 'anjali', 'kavya', 'divya', 'neha', 'pooja', 'riya',
      'sneha', 'swati', 'nikita', 'preeti', 'shweta', 'megha', 'isha', 'tanvi',
      'aditi', 'aishwarya', 'ananya', 'deepika', 'kriti', 'nisha', 'rachana',
      'sakshi', 'simran', 'sonali', 'tanya', 'varsha', 'vidya', 'zoya',
      'sarah', 'emily', 'jessica', 'jennifer', 'michelle', 'amanda', 'lisa',
      'maria', 'susan', 'karen', 'nancy', 'betty', 'helen', 'sandra', 'donna',
      'carol', 'ruth', 'sharon', 'laura', 'cynthia', 'anna', 'jean', 'alice'
    ];

    // Check if name ends with common female suffixes
    const femaleSuffixes = ['a', 'i', 'ya', 'ka', 'na'];
    const endsWithFemaleSuffix = femaleSuffixes.some(suffix =>
      firstName.endsWith(suffix) && firstName.length > 3
    );

    // Check if name is in female names list or ends with female suffix
    if (femaleNames.includes(firstName) || endsWithFemaleSuffix) {
      return '/female.jpg';
    }

    return '/male.jpg';
  };

  // Get current doctors based on view mode
  const currentDoctors = viewMode === 'online' ? onlineDoctors : doctors;
  const currentCount = viewMode === 'online' ? onlineDoctors.length : doctors.length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
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

      {/* Toggle Section */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex justify-center">
            <div className="inline-flex bg-gray-100 rounded-lg p-1 gap-1">
              <button
                onClick={() => setViewMode('online')}
                className={`px-8 py-2.5 rounded-md font-medium transition-all duration-200 ${viewMode === 'online'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                  }`}
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                Online Now
              </button>
              <button
                onClick={() => setViewMode('all')}
                className={`px-8 py-2.5 rounded-md font-medium transition-all duration-200 ${viewMode === 'all'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                  }`}
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                All Available
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Previous Doctors Section Removed in favor of inline tags */}

      {/* Unified Doctors Section */}
      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            {viewMode === 'online' && (
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            )}
            <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>
              {viewMode === 'online' ? 'Online Now' : 'All Professionals'}
            </h2>
          </div>
          {!loading && !error && (
            <span className="text-sm text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
              {currentCount} {viewMode === 'online' ? 'online' : 'available'}
            </span>
          )}
        </div>

        {/* Content */}
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
        ) : currentDoctors.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {viewMode === 'online' ? (
              // Online doctors view - use DoctorCard component
              onlineDoctors.map((doctor) => {
                // Find full doctor data from doctors array
                const fullDoctorData = doctors.find(d => d.userId._id === doctor._id);

                if (fullDoctorData) {
                  const pricingText = fullDoctorData.pricing.min === 0 && fullDoctorData.pricing.max === 0
                    ? 'Not Set'
                    : `₹${fullDoctorData.pricing.min} - ₹${fullDoctorData.pricing.max}`;

                  const experienceText = fullDoctorData.experience === 0
                    ? 'Unknown'
                    : `${fullDoctorData.experience} years`;

                  return (
                    <div key={doctor._id} className="relative">
                      {/* Online Badge Overlay */}
                      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-green-50 px-2.5 py-1 rounded-full border border-green-200">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                        <span className="text-xs font-medium text-green-700" style={{ fontFamily: 'Inter, sans-serif' }}>
                          Online
                        </span>
                      </div>

                      <DoctorCard
                        name={`Dr. ${fullDoctorData.userId.firstName} ${fullDoctorData.userId.lastName}`}
                        experience={experienceText}
                        qualification={fullDoctorData.qualification.join(', ') || 'Not specified'}
                        pricing={pricingText}
                        language={fullDoctorData.languages.join(', ') || 'Not specified'}
                        treatsFor={fullDoctorData.treatsFor.join(', ') || 'General'}
                        imageSrc={getDoctorImage(fullDoctorData)}
                        bgColor={getDoctorBgColor(fullDoctorData.userId._id)}
                        rating={fullDoctorData.rating}
                        isPrevious={previousDoctorIds.has(fullDoctorData._id)}
                        onBookSession={() => handleBookSession(doctor._id, true)}
                      />
                    </div>
                  );
                }

                // Fallback for doctors without full data
                return (
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
                        style={{ backgroundColor: getDoctorBgColor(doctor._id) }}
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
                );
              })
            ) : (
              // All doctors view - detailed cards
              doctors.map((doctor) => {
                return (
                  <DoctorCard
                    key={doctor._id}
                    name={`Dr. ${doctor.userId.firstName} ${doctor.userId.lastName}`}
                    experience={`${doctor.experience} years`}
                    qualification={doctor.qualification.join(', ')}
                    pricing={`₹${doctor.pricing.min} - ₹${doctor.pricing.max}`}
                    language={doctor.languages.join(', ')}
                    treatsFor={doctor.treatsFor.join(', ')}
                    imageSrc={doctor.profileImage || getDoctorImage(doctor)}
                    bgColor={getDoctorBgColor(doctor.userId._id)}
                    rating={doctor.rating}
                    isPrevious={previousDoctorIds.has(doctor._id)}
                    onBookSession={() => {
                      navigate('/book-session', {
                        state: {
                          doctorId: doctor.userId._id,
                          serviceType: 'General'
                        }
                      });
                    }}
                  />
                );
              })
            )}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p className="text-gray-600 text-sm mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
              {viewMode === 'online' ? 'No professionals online' : 'No professionals available'}
            </p>
            <p className="text-gray-400 text-xs" style={{ fontFamily: 'Inter, sans-serif' }}>Please check back later</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChooseProfessionalPage;
