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
  // Removed loading state for faster page load
  const [error, setError] = useState<string | null>(null);

  const serviceType = (location.state as any)?.serviceType || 'General';
  const bookingType = (location.state as any)?.bookingType || 'later';

  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5001/api' 
    : 'https://veraawell-backend.onrender.com/api';

  useEffect(() => {
    fetchDoctors();
  }, []);

  const fetchDoctors = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/sessions/doctors`);
      if (!response.ok) {
        throw new Error('Failed to fetch doctors');
      }
      const doctorsData = await response.json();
      setDoctors(doctorsData);
    } catch (error) {
      console.error('Error fetching doctors:', error);
      setError('Failed to load doctors. Please try again.');
    }
  };

  const handleBookSession = (doctorId: string) => {
    navigate('/doctor-profile', { 
      state: { 
        doctorId,
        serviceType,
        bookingType 
      } 
    });
  };


  const getRandomBgColor = (index: number) => {
    const colors = ['#ABA5D1', '#6DBEDF', '#38ABAE', '#78BE9F'];
    return colors[index % colors.length];
  };

  return (
    <div className="bg-white min-h-screen">
      {/* Main Content Section */}
      <div className="py-20 px-10" style={{ backgroundColor: '#E3F0F0' }}>
        <div className="max-w-4xl mx-auto text-center">
          {/* Main Heading */}
          <h1 className="text-4xl md:text-5xl font-semibold mb-8 font-serif" style={{ color: '#38ABAE' }}>
            Choose the Right Professional for Yourself
          </h1>
          
          {/* Description Paragraph */}
          <p className="text-lg md:text-xl text-gray-700 leading-relaxed mb-12 max-w-3xl mx-auto font-serif font-medium">
            Therapy is far more than a doctor-patient relationship. It is a partnership that alleviates 
            you every step of the way. That is why, you need to choose your psychologist carefully 
            and find someone with whom you are comfortable.
          </p>
          
          {/* Free Discovery Session Heading */}
          <h2 className="text-3xl md:text-4xl font-semibold mb-8 font-serif" style={{ color: '#38ABAE' }}>
            Free Discovery session !
          </h2>
          
          {/* Discovery Session Description */}
          <p className="text-lg md:text-xl text-gray-700 leading-relaxed max-w-3xl mx-auto font-serif font-medium">
            If confused, begin with a Discovery Session to get to know your therapist and an initial 
            experience of how everything works.
          </p>
        </div>
      </div>

      {/* Doctors Section */}
      <div className="py-16 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          {error && (
            <div className="text-center py-12">
              <p className="text-red-600 mb-4">{error}</p>
              <button 
                onClick={fetchDoctors}
                className="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700"
              >
                Try Again
              </button>
            </div>
          )}
          
          {!error && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {doctors.map((doctor, index) => (
                <DoctorCard
                  key={doctor._id}
                  name={`${doctor.userId.firstName} ${doctor.userId.lastName}`}
                  experience={`${doctor.experience} years`}
                  qualification={doctor.qualification.join(', ')}
                  pricing={`₹${doctor.pricing.min} - ₹${doctor.pricing.max}`}
                  language={doctor.languages.join(', ')}
                  treatsFor={doctor.treatsFor.join(', ')}
                  imageSrc={doctor.profileImage}
                  bgColor={getRandomBgColor(index)}
                  onBookSession={() => handleBookSession(doctor._id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChooseProfessionalPage;
