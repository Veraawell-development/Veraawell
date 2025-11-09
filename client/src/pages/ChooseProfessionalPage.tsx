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
    <div className="bg-white min-h-screen">
      {/* Main Content Section */}
      <div className="py-12 px-4 md:py-16 md:px-10" style={{ backgroundColor: '#E3F0F0' }}>
        <div className="max-w-5xl mx-auto text-center">
          {/* Main Heading */}
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-normal mb-6 md:mb-8" style={{ color: '#38ABAE', fontFamily: 'Bree Serif, serif' }}>
            Choose the Right Professional for Yourself
          </h1>
          
          {/* Description Paragraph */}
          <p className="text-base md:text-lg lg:text-xl leading-relaxed mb-8 md:mb-10 max-w-4xl mx-auto" style={{ color: '#000000', fontFamily: 'Bree Serif, serif', fontWeight: 400 }}>
            Therapy is far more than a doctor-patient relationship. It is a partnership that alleviates 
            you every step of the way. That is why, you need to choose your psychologist carefully 
            and find someone with whom you are comfortable.
          </p>
          
          {/* Free Discovery Session Heading */}
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-normal mb-6 md:mb-8" style={{ color: '#38ABAE', fontFamily: 'Bree Serif, serif' }}>
            Free Discovery session !
          </h2>
          
          {/* Discovery Session Description */}
          <p className="text-base md:text-lg lg:text-xl leading-relaxed max-w-4xl mx-auto" style={{ color: '#38ABAE', fontFamily: 'Bree Serif, serif', fontWeight: 400 }}>
            If confused, begin with a Discovery Session to get to know your therapist and an initial 
            experience of how everything works.
          </p>
        </div>
      </div>

      {/* Online Doctors Section */}
      {onlineDoctors.length > 0 && (
        <div className="py-8 px-4 md:py-12 md:px-8" style={{ backgroundColor: '#D1FAE5' }}>
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-center mb-8">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🟢</span>
                <h2 className="text-3xl md:text-4xl font-bold" style={{ color: '#10B981', fontFamily: 'Bree Serif, serif' }}>
                  Available Now - Online Doctors
                </h2>
              </div>
            </div>
            <p className="text-center text-lg mb-8" style={{ color: '#059669', fontFamily: 'Bree Serif, serif' }}>
              These doctors are currently online and ready to help you immediately!
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
              {onlineDoctors.map((doctor, index) => (
                <div key={doctor._id} className="relative">
                  {/* Online Badge */}
                  <div className="absolute -top-2 -right-2 z-10 bg-green-500 text-white px-3 py-1 rounded-full text-sm font-bold shadow-lg flex items-center gap-1">
                    <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                    ONLINE
                  </div>
                  <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-green-400 hover:shadow-xl transition-all">
                    <div className="text-center">
                      <div className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center text-3xl" style={{ backgroundColor: getRandomBgColor(index) }}>
                        👨‍⚕️
                      </div>
                      <h3 className="text-xl font-bold mb-2" style={{ fontFamily: 'Bree Serif, serif' }}>
                        Dr. {doctor.firstName} {doctor.lastName}
                      </h3>
                      <p className="text-sm text-gray-600 mb-4">{doctor.email}</p>
                      <button
                        onClick={() => handleBookSession(doctor._id)}
                        className="w-full px-6 py-3 bg-green-500 text-white rounded-full font-bold hover:bg-green-600 transition-colors"
                        style={{ fontFamily: 'Bree Serif, serif' }}
                      >
                        Book Immediate Session
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* All Doctors Section - Dynamic Grid */}
      <div className="py-12 px-4 md:py-16 md:px-8" style={{ backgroundColor: '#E3F0F0' }}>
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-8" style={{ color: '#38ABAE', fontFamily: 'Bree Serif, serif' }}>
            All Available Professionals
          </h2>
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
