import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import DoctorCard from '../components/DoctorCard';
import { API_CONFIG, API_BASE_URL } from '../config/api';
import { useDataSocket } from '../hooks/useDataSocket';
import LeafDecor from '../components/ui/LeafDecor';

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
  const initialViewMode = (location.state as any)?.bookingType === 'later' ? 'all' : 'online';
  const [viewMode, setViewMode] = useState<'online' | 'all'>(initialViewMode);

  const serviceType = (location.state as any)?.serviceType || 'General';

  //  REAL-TIME: Connect to data socket
  const { socket } = useDataSocket();

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

  //  REAL-TIME: Listen for doctor status changes
  useEffect(() => {
    if (!socket) return;

    socket.on('doctor:status-change', ({ doctorId, isOnline }) => {
      console.log('[REAL-TIME] Doctor status changed:', { doctorId: doctorId.substring(0, 8), isOnline });

      // Update online doctors list
      if (isOnline) {
        // Doctor came online - fetch updated list
        fetchOnlineDoctors();
      } else {
        // Doctor went offline - remove from list
        setOnlineDoctors(prev => prev.filter(d => d._id !== doctorId));
      }
    });

    return () => {
      socket.off('doctor:status-change');
    };
  }, [socket]);

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
    const colors = ['#C8E6C9', '#B2DFDB', '#D1C4E9', '#FFCCBC'];
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

  // Get current doctors based on view mode and sort them by service preference
  const currentDoctors = (viewMode === 'online' ? onlineDoctors : doctors).sort((a, b) => {
    if (serviceType === 'General') return 0;

    const aTreats = (a.treatsFor || []).map((s: string) => s.toLowerCase());
    const bTreats = (b.treatsFor || []).map((s: string) => s.toLowerCase());
    const lowerService = serviceType.toLowerCase();

    const aMatches = aTreats.includes(lowerService);
    const bMatches = bTreats.includes(lowerService);

    if (aMatches && !bMatches) return -1;
    if (!aMatches && bMatches) return 1;
    return 0;
  });

  const currentCount = currentDoctors.length;

  return (
    <div className="h-screen pt-16 md:pt-[80px] bg-[var(--bg-2)] flex flex-col overflow-hidden relative box-border">
      {/* Background Ornaments */}
      <LeafDecor 
        style={{ 
          position: 'absolute', 
          top: '-5%', 
          left: '-10%', 
          width: '500px', 
          height: '500px', 
          opacity: 0.6, 
          transform: 'rotate(-20deg)', 
          zIndex: 0 
        }} 
      />
      <div 
        className="absolute top-[20%] right-[-10%] w-[600px] h-[600px] rounded-full blur-[120px] pointer-events-none z-0" 
        style={{ background: 'radial-gradient(circle, rgba(107, 168, 136, 0.15), transparent 60%)' }} 
      />

      {/* Hero Section */}
      <div className="shrink-0 relative z-10">
        <div className="max-w-6xl mx-auto px-6 pt-12 pb-6 relative flex flex-col items-center">
          {/* Back Button */}
          <button
            onClick={() => navigate('/patient-dashboard')}
            className="absolute left-6 top-12 flex items-center gap-3 text-[11px] font-bold tracking-[0.15em] uppercase transition-all duration-300 hover:-translate-x-1"
            style={{ color: 'var(--teal)' }}
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300"
              style={{ background: 'rgba(0,151,178,0.1)', border: '1px solid rgba(0,151,178,0.2)' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </div>
            Back to Dashboard
          </button>
          
          <div className="text-center max-w-2xl mt-14 md:mt-4">
            <h1 
              className="text-4xl md:text-5xl font-normal mb-4 text-center leading-tight tracking-tight" 
              style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}
            >
              Find Your <em style={{ color: 'var(--teal)' }}>Therapist</em>
            </h1>
            <p className="text-[16px] text-gray-500 mb-8 mx-auto max-w-md" style={{ color: 'var(--text-2)' }}>
              Choose a professional who understands you. Start with a free discovery session to find the right fit.
            </p>

            {/* Discovery Session Badge */}
            <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full"
              style={{ background: 'rgba(107,168,136,0.1)', border: '1px solid rgba(107,168,136,0.2)' }}
            >
              <svg className="w-4 h-4" style={{ color: 'var(--sage)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-[13px] font-semibold" style={{ color: 'var(--teal-dark)' }}>
                Free Discovery Session Available
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Toggle Section */}
      <div className="shrink-0 relative z-20 pb-4">
        <div className="max-w-[1200px] mx-auto px-6 flex justify-center">
          <div 
            className="inline-flex rounded-full p-1.5 shadow-sm"
            style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.8)', backdropFilter: 'blur(8px)' }}
          >
            <button
              onClick={() => setViewMode('online')}
              className={`px-8 py-2.5 rounded-full font-bold text-[13px] transition-all duration-300 ${viewMode === 'online'
                ? 'shadow-md'
                : 'bg-transparent opacity-60 hover:opacity-100'
                }`}
              style={{ 
                color: viewMode === 'online' ? '#fff' : 'var(--teal-dark)',
                background: viewMode === 'online' ? 'var(--teal)' : 'transparent'
              }}
            >
              Available Now
            </button>
            <button
              onClick={() => setViewMode('all')}
              className={`px-8 py-2.5 rounded-full font-bold text-[13px] transition-all duration-300 ${viewMode === 'all'
                ? 'shadow-md'
                : 'bg-transparent opacity-60 hover:opacity-100'
                }`}
              style={{ 
                color: viewMode === 'all' ? '#fff' : 'var(--teal-dark)',
                background: viewMode === 'all' ? 'var(--teal)' : 'transparent'
              }}
            >
              All Available
            </button>
          </div>
        </div>
      </div>

      {/* Unified Doctors Section */}
      <div className="flex-1 overflow-y-auto pb-12 relative z-10">
        <div className="max-w-6xl mx-auto px-6 pt-6">
          {/* Section Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <h2 className="text-[20px] font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
              {viewMode === 'online' ? 'Available Now' : 'All Professionals'}
            </h2>
            {viewMode === 'online' && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: 'var(--sage)' }}></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: 'var(--sage)' }}></span>
              </span>
            )}
          </div>
          {!loading && !error && (
            <span className="text-[13px] font-medium" style={{ color: 'var(--text-2)' }}>
              {currentCount} {viewMode === 'online' ? 'online' : 'available'}
            </span>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 mb-3" style={{ borderColor: 'var(--teal)' }}></div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>Loading professionals...</p>
          </div>
        ) : error ? (
          <div className="text-center py-16 rounded-3xl" style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.9)' }}>
            <p className="text-red-600 mb-4 text-sm font-medium">{error}</p>
            <button
              onClick={fetchDoctors}
              className="px-6 py-2.5 text-white text-sm font-semibold rounded-full transition-colors shadow-sm"
              style={{ background: 'var(--teal)' }}
            >
              Try Again
            </button>
          </div>
        ) : currentDoctors.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {viewMode === 'online' ? (
              // Online doctors view
              onlineDoctors.map((doctor) => {
                const fullDoctorData = doctors.find(d => d.userId._id === doctor._id);

                if (fullDoctorData) {
                  const pricingText = fullDoctorData.pricing.min === 0 && fullDoctorData.pricing.max === 0
                    ? 'Not Set'
                    : `₹${fullDoctorData.pricing.min} - ₹${fullDoctorData.pricing.max}`;

                  const experienceText = fullDoctorData.experience === 0
                    ? 'Unknown'
                    : `${fullDoctorData.experience} years`;

                  return (
                      <DoctorCard
                        key={doctor._id}
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
                        onViewProfile={() => {
                          navigate(`/doctor/${fullDoctorData.userId._id}`, {
                            state: {
                              serviceType: 'General',
                              bookingType: 'immediate'
                            }
                          });
                        }}
                        onBookSession={() => handleBookSession(doctor._id, true)}
                        isOnline={true}
                      />
                  );
                }

                // Fallback for doctors without full data
                return (
                  <div
                    key={doctor._id}
                    className="group rounded-3xl p-6 transition-all duration-300 flex flex-col h-full relative overflow-hidden"
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.7)',
                      border: '1px solid rgba(255, 255, 255, 0.8)',
                      backdropFilter: 'blur(16px)',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.02)'
                    }}
                  >
                    {/* Hover Glow */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                      style={{ background: 'radial-gradient(circle at 50% 0%, rgba(107, 168, 136, 0.05), transparent 70%)' }}
                    />
                    
                    {/* Online Badge */}
                    <div className="flex justify-end mb-4 relative z-10">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                        style={{ background: 'rgba(107, 168, 136, 0.1)', border: '1px solid rgba(107, 168, 136, 0.2)' }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--sage)' }}></div>
                        <span className="text-[11px] font-bold tracking-wide uppercase" style={{ color: 'var(--sage)' }}>
                          Online
                        </span>
                      </div>
                    </div>

                    {/* Doctor Info */}
                    <div className="flex flex-col items-center flex-1 relative z-10">
                      <div
                        className="w-24 h-24 mb-5 rounded-full flex items-center justify-center text-white text-3xl font-display shadow-lg"
                        style={{ backgroundColor: getDoctorBgColor(doctor._id) }}
                      >
                        {doctor.firstName.charAt(0)}{doctor.lastName.charAt(0)}
                      </div>
                      <h3 className="text-xl font-semibold mb-1 text-center" style={{ color: 'var(--text)' }}>
                        Dr. {doctor.firstName} {doctor.lastName}
                      </h3>
                      <p className="text-[14px] mb-8 text-center truncate w-full" style={{ color: 'var(--text-2)' }}>
                        {doctor.email}
                      </p>
                      
                      <div className="mt-auto w-full">
                        <button
                          onClick={() => handleBookSession(doctor._id, true)}
                          className="w-full px-4 py-3 text-white text-[14px] font-bold rounded-full transition-all duration-300 shadow-md hover:-translate-y-1"
                          style={{ background: 'var(--teal)', boxShadow: '0 8px 20px rgba(0,151,178,0.2)' }}
                        >
                          Book Now
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              // All doctors view
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
                    onViewProfile={() => {
                      navigate(`/doctor/${doctor.userId._id}`, {
                        state: {
                          serviceType: 'General',
                          bookingType: 'scheduled'
                        }
                      });
                    }}
                    onBookSession={() => {
                      navigate(`/doctor/${doctor.userId._id}`, {
                        state: {
                          serviceType: 'General',
                          bookingType: 'scheduled'
                        }
                      });
                    }}
                  />
                );
              })
            )}
          </div>
        ) : (
          <div className="text-center py-20 rounded-3xl" style={{ background: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(0,0,0,0.1)' }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(0,151,178,0.05)' }}>
              <svg className="w-8 h-8 opacity-50" style={{ color: 'var(--teal)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p className="text-[15px] font-semibold mb-1" style={{ color: 'var(--dark-text)' }}>
              {viewMode === 'online' ? 'No professionals online' : 'No professionals available'}
            </p>
            <p className="text-[13px]" style={{ color: 'var(--dark-text-2)' }}>Please check back later</p>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default ChooseProfessionalPage;
