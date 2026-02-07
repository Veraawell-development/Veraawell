import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../config/api';

interface BookingState {
  mode: 'video' | 'voice';
  duration: 65 | 40 | 25;
  price: number;
  date: string;
  timeSlot: string;
}

interface DoctorProfile {
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

const DoctorProfilePage: React.FC = () => {
  const { doctorId } = useParams<{ doctorId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { serviceType, bookingType } = (location.state as any) || { bookingType: 'scheduled' };

  // Determine if this is an immediate booking (Available Now doctor)
  const isImmediate = bookingType === 'immediate';

  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [booking, setBooking] = useState<BookingState>({
    mode: 'video',
    duration: 65,
    price: 2000,
    date: '',
    timeSlot: ''
  });

  const [availableDates, setAvailableDates] = useState<Array<{ date: string; day: string }>>([]);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [isBooking, setIsBooking] = useState(false);

  // Reviews state
  const [doctorReviews, setDoctorReviews] = useState<any[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  useEffect(() => {
    generateAvailableDates();
    if (doctorId) {
      fetchDoctorProfile();
      fetchDoctorReviews();
    }
  }, [doctorId]);

  useEffect(() => {
    if (doctorId && booking.date) {
      fetchAvailableSlots(booking.date);
    }
  }, [doctorId, booking.date]);

  const fetchDoctorProfile = async () => {
    try {
      setLoading(true);
      console.log(' Fetching doctor profile for ID:', doctorId);
      console.log(' API URL:', `${API_BASE_URL}/sessions/doctors/${doctorId}`);

      const response = await fetch(`${API_BASE_URL}/sessions/doctors/${doctorId}`);

      console.log('📥 Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('❌ Error response:', errorData);
        throw new Error(errorData.message || 'Doctor not found');
      }

      const data = await response.json();
      console.log(' Doctor profile loaded:', data);
      setDoctorProfile(data);
      setError(null);
    } catch (err: any) {
      console.error('❌ Error fetching doctor profile:', err);
      setError(err.message || 'Failed to load doctor profile');
    } finally {
      setLoading(false);
    }
  };

  const fetchDoctorReviews = async () => {
    if (!doctorId) return;

    try {
      setReviewsLoading(true);
      const response = await fetch(`${API_BASE_URL}/reviews/doctor/${doctorId}?limit=10`);

      if (response.ok) {
        const data = await response.json();
        setDoctorReviews(data.reviews || []);
      } else {
        console.error('Failed to fetch reviews');
        setDoctorReviews([]);
      }
    } catch (error) {
      console.error('Error fetching doctor reviews:', error);
      setDoctorReviews([]);
    } finally {
      setReviewsLoading(false);
    }
  };

  const fetchAvailableSlots = async (date: string) => {
    try {
      console.log(`Fetching slots for doctor ${doctorId} on ${date}`);
      const response = await fetch(`${API_BASE_URL}/sessions/doctors/${doctorId}/slots/${date}`);

      if (response.ok) {
        const data = await response.json();
        setAvailableSlots(data.availableSlots || []);
        // Reset selected time slot if it's no longer available
        if (booking.timeSlot && !data.availableSlots.includes(booking.timeSlot)) {
          setBooking(prev => ({ ...prev, timeSlot: '' }));
        }
      } else {
        console.error('Failed to fetch slots');
        setAvailableSlots([]);
      }
    } catch (error) {
      console.error('Error fetching slots:', error);
      setAvailableSlots([]);
    }
  };

  const generateAvailableDates = () => {
    const dates: Array<{ date: string; day: string }> = [];
    const today = new Date();

    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);

      const dateStr = date.toISOString().split('T')[0];
      const dayStr = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
      const dayMonth = date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });

      dates.push({ date: dateStr, day: `${dayMonth} ${dayStr}` });
    }

    setAvailableDates(dates);
    if (bookingType === 'now') {
      // Don't auto-set slot here, let fetchAvailableSlots handle it or user select
      setBooking(prev => ({ ...prev, date: dates[0].date }));
    } else {
      // Default to first date
      setBooking(prev => ({ ...prev, date: dates[0].date }));
    }
  };

  const handleModeChange = (mode: 'video' | 'voice') => {
    setBooking(prev => ({ ...prev, mode }));
  };

  const handleDurationChange = (duration: 65 | 40 | 25) => {
    let price = 2000;
    if (duration === 40) price = 1200;
    if (duration === 25) price = 0;

    setBooking(prev => ({ ...prev, duration, price }));
  };

  const handleDateChange = (date: string) => {
    setBooking(prev => ({ ...prev, date }));
  };

  const handleTimeSlotChange = (timeSlot: string) => {
    setBooking(prev => ({ ...prev, timeSlot }));
  };

  const handleBookNow = async () => {
    // Validation: scheduled bookings need date/time, immediate bookings don't
    if (!isImmediate && (!booking.date || !booking.timeSlot)) {
      toast.error('Please select both date and time slot');
      return;
    }

    setIsBooking(true);

    try {
      // Get token from localStorage
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Use different endpoints and payloads for immediate vs scheduled
      const endpoint = isImmediate
        ? `${API_BASE_URL}/sessions/book-immediate`
        : `${API_BASE_URL}/sessions/book`;

      const requestBody = isImmediate
        ? {
          // Immediate booking - only needs doctorId
          // Backend generates date/time/price automatically
          doctorId,
          mode: booking.mode
        }
        : {
          // Scheduled booking - requires full details
          doctorId,
          sessionDate: booking.date,
          sessionTime: booking.timeSlot,
          sessionType: 'scheduled',
          mode: booking.mode,
          duration: booking.duration,
          price: booking.price,
          serviceType: serviceType || 'General'
        };

      console.log('📞 Booking request:', {
        endpoint,
        isImmediate,
        payload: requestBody
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Booking successful:', data);

        // Different success messages
        const successMessage = isImmediate
          ? 'Immediate session booked! You can join now from your dashboard.'
          : 'Session scheduled successfully! Check your dashboard for details.';
        toast.success(successMessage);

        // Navigate immediately
        setTimeout(() => {
          navigate('/patient-dashboard');
        }, 500);
      } else {
        const error = await response.json();
        console.error('❌ Booking failed:', error);
        toast.error(error.message || 'Booking failed. Please try again.');
      }
    } catch (error) {
      console.error('Booking error:', error);
      toast.error('Failed to book session. Please try again.');
    } finally {
      setIsBooking(false);
    }
  };



  // Show loading state
  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-2 border-teal-600 mb-4"></div>
          <p className="text-xl text-gray-600" style={{ fontFamily: 'Bree Serif, serif' }}>Loading doctor profile...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error || !doctorProfile) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-red-600 mb-4" style={{ fontFamily: 'Bree Serif, serif' }}>{error || 'Doctor not found'}</p>
          <button
            onClick={() => navigate('/choose-professional')}
            className="px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
            style={{ fontFamily: 'Bree Serif, serif' }}
          >
            Back to Professionals
          </button>
        </div>
      </div>
    );
  }

  // Extract doctor data with fallbacks
  const doctorName = `${doctorProfile.userId.firstName} ${doctorProfile.userId.lastName}`;
  const experienceText = doctorProfile.experience > 0 ? `${doctorProfile.experience}+ years` : 'Unknown';
  const qualificationText = doctorProfile.qualification.join(', ');
  const specializationText = doctorProfile.specialization.join(', ');
  const languagesText = doctorProfile.languages.join(', ');
  const rating = doctorProfile.rating.average;
  const fullStars = Math.floor(rating);

  const getDoctorBgColor = (id: string) => {
    const colors = ['#ABA5D1', '#7DA9A8', '#6DBEDF', '#A8D5BA'];
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const doctorColor = getDoctorBgColor(doctorProfile.userId._id);
  const lightBgColor = hexToRgba(doctorColor, 0.15); // 15% opacity for background sections

  return (
    <div className="bg-white min-h-screen">
      {/* Hero Section with Background */}
      <div className="relative h-[60vh] overflow-hidden">
        <img
          src="/profile-bg.svg"
          alt="Veraawell clinic background"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0  bg-opacity-30"></div>
      </div>

      {/* Profile Details Section */}
      <div className="relative -mt-32 max-w-5xl mx-auto px-4">
        <div className="flex items-end">
          {/* Profile Picture */}
          <div className="w-1/3">
            <div className="rounded-2xl overflow-hidden shadow-2xl border-8 border-white">
              <img
                src={doctorProfile.profileImage}
                alt={`Dr. ${doctorName}`}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Profile Info */}
          <div className="w-2/3 pl-12 pb-4">
            <div className="flex justify-between items-center">
              <h1 className="text-5xl font-bold text-gray-800">{doctorName}</h1>
              <div className="flex text-yellow-500">
                {[...Array(5)].map((_, i) => (
                  <svg
                    key={i}
                    className={`w-8 h-8 ${i < fullStars ? 'fill-current' : 'fill-gray-300'}`}
                    viewBox="0 0 20 20"
                  >
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                  </svg>
                ))}
              </div>
            </div>
            <div className="mt-4 text-lg text-gray-700 space-y-2">
              <p><span className="font-bold">Experience:</span> {experienceText}</p>
              <p><span className="font-bold">Qualification:</span> {qualificationText}</p>
              <p><span className="font-bold">Specialization:</span> {specializationText}</p>
              <p><span className="font-bold">Languages:</span> {languagesText}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quote and About Section */}
      <div className="mt-16 py-16 px-4" style={{ backgroundColor: lightBgColor }}>
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-semibold italic mb-8" style={{ color: doctorColor }}>
            "Who looks outside, dreams; who looks inside, awakes"
          </h2>
          <div className="text-gray-600 text-lg leading-relaxed space-y-4">
            {doctorProfile.bio && doctorProfile.bio !== 'Profile not completed yet' ? (
              <p>{doctorProfile.bio}</p>
            ) : (
              <>
                <p>At Veraawell, we believe mental wellness is not a luxury — it's a necessity. Our mission is simple: to make professional psychological support accessible, reliable, and timely for everyone who needs it.</p>
                <p>We connect you with highly qualified and compassionate psychologists who specialize in understanding your unique needs. Whether you're seeking help for anxiety, depression, stress, relationship issues, or personal growth, our experts are here to guide you — right when you need them.</p>
                <p>We know that mental health struggles can't always wait, so we ensure timely consultations, flexible scheduling, and a safe, judgment-free space for every individual.</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Booking Section */}
      <div className="py-16 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Card */}
            <div
              className="rounded-2xl p-8 text-white shadow-2xl"
              style={{ backgroundColor: doctorColor }}
            >
              <div className="space-y-8">
                {/* Select Mode */}
                <div className="flex items-center">
                  <h3 className="font-bold text-xl w-1/3">Select Mode:</h3>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => handleModeChange('video')}
                      className={`${booking.mode === 'video' ? 'bg-white ring-2 ring-blue-400' : 'bg-[#E0F7FA]'} text-[#38ABAE] font-semibold py-2 px-5 rounded-full shadow-inner transition-all`}
                      style={{ color: doctorColor }}
                    >
                      Video Call
                    </button>
                    <button
                      onClick={() => handleModeChange('voice')}
                      className={`${booking.mode === 'voice' ? 'bg-white ring-2 ring-blue-400' : 'bg-[#E0F7FA]'} text-[#38ABAE] font-semibold py-2 px-5 rounded-full shadow-inner transition-all`}
                      style={{ color: doctorColor }}
                    >
                      Voice Call
                    </button>
                  </div>
                </div>
                {/* Select Duration */}
                <div className="flex items-center">
                  <h3 className="font-bold text-xl w-1/3">Select Duration:</h3>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => handleDurationChange(65)}
                      className={`${booking.duration === 65 ? 'bg-white ring-2 ring-blue-400' : 'bg-[#E0F7FA]'} text-[#38ABAE] font-semibold py-2 px-5 rounded-full shadow-inner transition-all`}
                      style={{ color: doctorColor }}
                    >
                      65 Minutes
                    </button>
                    <button
                      onClick={() => handleDurationChange(40)}
                      className={`${booking.duration === 40 ? 'bg-white ring-2 ring-blue-400' : 'bg-[#E0F7FA]'} text-[#38ABAE] font-semibold py-2 px-5 rounded-full shadow-inner transition-all`}
                      style={{ color: doctorColor }}
                    >
                      40 Minutes
                    </button>
                    <button
                      onClick={() => handleDurationChange(25)}
                      className={`${booking.duration === 25 ? 'bg-white ring-2 ring-blue-400' : 'bg-[#E0F7FA]'} text-[#38ABAE] font-semibold py-2 px-5 rounded-full shadow-inner transition-all`}
                      style={{ color: doctorColor }}
                    >
                      25 Minutes
                    </button>
                  </div>
                </div>
                {/* Price */}
                <div className="flex items-center">
                  <h3 className="font-bold text-xl w-1/3">Price:</h3>
                  <div className="flex space-x-3">
                    <div
                      className="bg-[#E0F7FA] text-[#38ABAE] font-semibold py-2 px-5 rounded-full shadow-inner"
                      style={{ color: doctorColor }}
                    >
                      Rs. {booking.price}
                    </div>
                  </div>
                </div>
                <p className="text-sm pt-4 font-medium">Note: The session for the duration of 25 minutes is a discovery session where you can discuss your problems and discuss the way forward.</p>
              </div>
            </div>

            {/* Right Card */}
            <div
              className="rounded-2xl p-8 text-white shadow-2xl"
              style={{ backgroundColor: doctorColor }}
            >
              <div className="space-y-8">
                {/* Conditional: Only show date/time selection for scheduled bookings */}
                {!isImmediate ? (
                  <>
                    {/* Select Date */}
                    <div>
                      <h3 className="font-bold text-xl mb-4">Select Date:</h3>
                      <div className="flex space-x-3 overflow-x-auto pb-2">
                        {availableDates.map((dateObj) => (
                          <button
                            key={dateObj.date}
                            onClick={() => handleDateChange(dateObj.date)}
                            className={`${booking.date === dateObj.date ? 'bg-white ring-2 ring-blue-400' : 'bg-[#E0F7FA]'} text-[#38ABAE] font-semibold py-2 px-4 rounded-lg text-center flex-shrink-0 shadow-inner transition-all`}
                            style={{ color: doctorColor }}
                          >
                            <div className="text-sm">{dateObj.day.split(' ').slice(0, 2).join(' ')}</div>
                            <div className="font-bold text-xs">{dateObj.day.split(' ')[2]}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Select Slot */}
                    <div>
                      <h3 className="font-bold text-xl mb-4">Select Slot:</h3>
                      <div className="flex flex-wrap gap-3">
                        {availableSlots.length > 0 ? availableSlots.map((slot) => (
                          <button
                            key={slot}
                            onClick={() => handleTimeSlotChange(slot)}
                            className={`${booking.timeSlot === slot ? 'bg-white ring-2 ring-blue-400' : 'bg-[#E0F7FA]'} text-[#38ABAE] font-semibold py-2 px-5 rounded-full shadow-inner transition-all`}
                            style={{ color: doctorColor }}
                          >
                            {slot}
                          </button>
                        )) : (
                          <p className="text-white opacity-80 italic">No available slots for this date</p>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  /* For immediate bookings, show a message */
                  <div className="text-center py-8">
                    <div className="bg-white/10 rounded-xl p-6 mb-4">
                      <svg className="w-16 h-16 mx-auto mb-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <h3 className="text-2xl font-bold mb-2">Instant Session</h3>
                      <p className="text-white/90">This doctor is available now. Click "Book Now" to start your session immediately!</p>
                    </div>
                  </div>
                )}

                <div className="text-center pt-4 space-y-3">
                  <button
                    onClick={handleBookNow}
                    disabled={isImmediate ? isBooking : (isBooking || !booking.date || !booking.timeSlot)}
                    className={`${(isImmediate ? isBooking : (isBooking || !booking.date || !booking.timeSlot)) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white hover:scale-105'} bg-[#E0F7FA] text-[#38ABAE] font-bold py-3 px-10 rounded-full shadow-md text-xl transition-all w-full`}
                    style={{ color: doctorColor }}
                  >
                    {isBooking ? 'Booking...' : 'Book Now'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reviews Section */}
      <div className="py-16" style={{ backgroundColor: lightBgColor }}>
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold mb-8 text-center" style={{ color: doctorColor }}>
            Patient Reviews
          </h2>

          {reviewsLoading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
              <p className="text-gray-600 mt-4">Loading reviews...</p>
            </div>
          ) : doctorReviews.length > 0 ? (
            <div className="flex overflow-x-auto space-x-8 pb-4">
              {doctorReviews.map((review) => (
                <div key={review._id} className="bg-white p-6 rounded-lg shadow-md flex-shrink-0 w-80">
                  <h3 className="text-2xl font-bold mb-2" style={{ color: doctorColor }}>
                    {review.patientId.firstName} {review.patientId.lastName && review.patientId.lastName.charAt(0) + '.'}
                  </h3>
                  <div className="flex text-yellow-500 mb-4">
                    {[...Array(5)].map((_, i) => (
                      <svg
                        key={i}
                        className={`w-6 h-6 ${i < review.rating ? 'fill-current' : 'fill-gray-300'}`}
                        viewBox="0 0 20 20"
                      >
                        <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                      </svg>
                    ))}
                  </div>
                  <p className="text-gray-600 italic leading-relaxed">
                    "{review.feedback}"
                  </p>
                  {review.positives && (
                    <p className="text-green-600 text-sm mt-3">
                      <strong>Positives:</strong> {review.positives}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p className="text-lg">No reviews yet for this doctor.</p>
              <p className="text-sm mt-2">Be the first to share your experience!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DoctorProfilePage;
