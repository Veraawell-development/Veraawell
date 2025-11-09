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
  const bookingType = (location.state as any)?.bookingType || 'later';

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

  const handleBookSession = (doctorId: string) => {
    // Navigate to dynamic doctor profile page using URL parameter
    navigate(`/doctor/${doctorId}`, { 
      state: { 
        serviceType,
        bookingType 
      } 
    });
  };


  const getRandomBgColor = (index: number) => {
    const colors = ['#ABA5D1', '#6DBEDF', '#38ABAE'];
    return colors[index % colors.length];
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#E3F0F0' }}>
      {/* Hero Section */}
      <div className="py-16 px-4 md:py-20 md:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-normal mb-6" style={{ color: '#38ABAE', fontFamily: 'Bree Serif, serif' }}>
            Choose the Right Professional for Yourself
          </h1>
          <p className="text-lg md:text-xl leading-relaxed mb-8" style={{ color: '#2D3748', fontFamily: 'Bree Serif, serif', fontWeight: 400 }}>
            Therapy is far more than a doctor-patient relationship. It is a partnership that alleviates 
            you every step of the way. That is why, you need to choose your psychologist carefully 
            and find someone with whom you are comfortable.
          </p>
          <div className="inline-block bg-white px-8 py-4 rounded-2xl shadow-sm">
            <h2 className="text-2xl md:text-3xl font-normal mb-2" style={{ color: '#38ABAE', fontFamily: 'Bree Serif, serif' }}>
              Free Discovery Session
            </h2>
            <p className="text-base md:text-lg" style={{ color: '#6B7280', fontFamily: 'Bree Serif, serif' }}>
              Get to know your therapist and experience how everything works
            </p>
          </div>
        </div>
      </div>

      {/* Online Doctors Section */}
      {onlineDoctors.length > 0 && (
        <div className="py-12 px-4 md:px-8">
          <div className="max-w-6xl mx-auto">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <h2 className="text-2xl md:text-3xl font-normal" style={{ color: '#38ABAE', fontFamily: 'Bree Serif, serif' }}>
                  Available Now
                </h2>
              </div>
              <span className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                {onlineDoctors.length} {onlineDoctors.length === 1 ? 'doctor' : 'doctors'} online
              </span>
            </div>

            {/* Online Doctors Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
              {onlineDoctors.map((doctor, index) => (
                <div 
                  key={doctor._id} 
                  className="bg-white rounded-2xl p-6 shadow-md hover:shadow-lg transition-all duration-300 relative"
                >
                  {/* Online Status Badge */}
                  <div className="absolute top-4 right-4">
                    <div className="flex items-center gap-1.5 bg-green-50 px-2.5 py-1 rounded-full">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-xs font-medium text-green-700" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Online
                      </span>
                    </div>
                  </div>

                  {/* Doctor Info */}
                  <div className="text-center pt-2">
                    <div 
                      className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center text-white text-2xl font-bold"
                      style={{ backgroundColor: getRandomBgColor(index) }}
                    >
                      {doctor.firstName.charAt(0)}{doctor.lastName.charAt(0)}
                    </div>
                    <h3 className="text-lg font-semibold mb-1" style={{ fontFamily: 'Bree Serif, serif', color: '#2D3748' }}>
                      Dr. {doctor.firstName} {doctor.lastName}
                    </h3>
                    <p className="text-sm text-gray-500 mb-5" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {doctor.email}
                    </p>
                    <button
                      onClick={() => handleBookSession(doctor._id)}
                      className="w-full px-6 py-2.5 text-white rounded-full font-medium hover:opacity-90 transition-all"
                      style={{ 
                        backgroundColor: '#38ABAE',
                        fontFamily: 'Bree Serif, serif'
                      }}
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

      {/* All Doctors Section - Dynamic Grid */}
      <div className="py-12 px-4 md:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl md:text-3xl font-normal" style={{ color: '#38ABAE', fontFamily: 'Bree Serif, serif' }}>
              All Available Professionals
            </h2>
            {!loading && !error && (
              <span className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                {doctors.length} {doctors.length === 1 ? 'professional' : 'professionals'}
              </span>
            )}
          </div>
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
              <p className="mt-4 text-gray-600" style={{ fontFamily: 'Bree Serif, serif' }}>Loading professionals...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600 mb-4 text-lg" style={{ fontFamily: 'Bree Serif, serif' }}>{error}</p>
              <button 
                onClick={fetchDoctors}
                className="px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                style={{ fontFamily: 'Bree Serif, serif' }}
              >
                Try Again
              </button>
            </div>
          ) : doctors.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
              {doctors.map((doctor, index) => {
                // Handle pricing display
                const pricingText = doctor.pricing.min === 0 && doctor.pricing.max === 0
                  ? 'Not Set'
                  : `₹${doctor.pricing.min} - ₹${doctor.pricing.max}`;
                
                // Handle experience display
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
            <div className="text-center py-12">
              <p className="text-gray-600 text-xl mb-2" style={{ fontFamily: 'Bree Serif, serif' }}>No professionals available at the moment</p>
              <p className="text-gray-500" style={{ fontFamily: 'Bree Serif, serif' }}>Please check back later or contact support</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChooseProfessionalPage;
