import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isToday, parseTime } from '../utils/dateUtils';
import { FiVideo, FiPhone, FiZap } from 'react-icons/fi';

interface BookingState {
  mode: 'video' | 'voice';
  duration: number;
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
    session20?: number;
    session40?: number;
    session55?: number;
    audio?: {
      session20?: number;
      session40?: number;
      session55?: number;
    };
  };
  profileImage: string;
  bannerImage?: string;
  bio: string;
  isOnline: boolean;
  rating: {
    average: number;
    totalReviews: number;
  };
  quote?: string;
  quoteAuthor?: string;
}

const DoctorProfilePage: React.FC = () => {
  const { doctorId } = useParams<{ doctorId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoggedIn, user } = useAuth();
  const { serviceType, bookingType } = (location.state as any) || { bookingType: 'scheduled' };

  // Determine if this is an immediate booking (Available Now doctor)
  const isImmediate = bookingType === 'immediate';

  const queryClient = useQueryClient();

  const [booking, setBooking] = useState<BookingState>({
    mode: 'video',
    duration: 20, // Default to 20
    price: 0,
    date: '',
    timeSlot: ''
  });

  const getPriceForDurationAndMode = (dur: number, selectedMode: 'video' | 'voice') => {
    if (!doctorProfile) return 0;

    if (selectedMode === 'voice' && doctorProfile.pricing.audio) {
      switch (dur) {
        case 20: return doctorProfile.pricing.audio.session20 || doctorProfile.pricing.session20 || doctorProfile.pricing.min;
        case 40: return doctorProfile.pricing.audio.session40 || doctorProfile.pricing.session40 || (doctorProfile.pricing.session20 || doctorProfile.pricing.min);
        case 55: return doctorProfile.pricing.audio.session55 || doctorProfile.pricing.session55 || doctorProfile.pricing.max;
        default: return doctorProfile.pricing.min;
      }
    }

    switch (dur) {
      case 20: return (doctorProfile.pricing.session20 !== undefined && doctorProfile.pricing.session20 !== null) ? doctorProfile.pricing.session20 : doctorProfile.pricing.min;
      case 40: return (doctorProfile.pricing.session40 !== undefined && doctorProfile.pricing.session40 !== null) ? doctorProfile.pricing.session40 : (doctorProfile.pricing.session20 || doctorProfile.pricing.min);
      case 55: return (doctorProfile.pricing.session55 !== undefined && doctorProfile.pricing.session55 !== null) ? doctorProfile.pricing.session55 : doctorProfile.pricing.max;
      default: return doctorProfile.pricing.min;
    }
  };

  const [availableDates, setAvailableDates] = useState<Array<{ date: string; day: string; dayNum: number; monthName: string }>>([]);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const { data: doctorProfile, isLoading: profileLoading, error: profileError } = useQuery<DoctorProfile>({
    queryKey: ['doctor', doctorId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/sessions/doctors/${doctorId}`);
      if (!response.ok) throw new Error('Doctor not found');
      return response.json();
    },
    enabled: !!doctorId
  });

  const { data: doctorReviews = [], isLoading: reviewsLoading } = useQuery<any[]>({
    queryKey: ['doctor', 'reviews', doctorId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/reviews/doctor/${doctorId}?limit=10&includeAll=true`);
      if (!response.ok) throw new Error('Failed to fetch reviews');
      const data = await response.json();
      return data.reviews || [];
    },
    enabled: !!doctorId
  });

  const { data: fetchedAvailableSlots = [] } = useQuery<string[]>({
    queryKey: ['doctor', 'slots', doctorId, booking.date],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/sessions/doctors/${doctorId}/slots/${booking.date}`);
      if (!response.ok) throw new Error('Failed to fetch slots');
      const data = await response.json();
      const now = new Date();

      return (data.availableSlots as string[]).filter((slot: string) => {
        if (!isToday(booking.date)) return true;
        const [h, m] = parseTime(slot);
        const slotDate = new Date();
        slotDate.setHours(h, m, 0, 0);
        return slotDate > now;
      });
    },
    enabled: !!doctorId && !!booking.date
  });

  useEffect(() => {
    generateAvailableDates();
  }, [doctorId]);

  // Update initial booking price once profile is loaded
  useEffect(() => {
    if (doctorProfile) {
      setBooking(prev => ({
        ...prev,
        price: getPriceForDurationAndMode(prev.duration, prev.mode)
      }));
    }
  }, [doctorProfile]);

  useEffect(() => {
    if (fetchedAvailableSlots.length > 0) {
      setAvailableSlots(fetchedAvailableSlots);
      if (booking.timeSlot && !fetchedAvailableSlots.includes(booking.timeSlot)) {
        setBooking(prev => ({ ...prev, timeSlot: '' }));
      }
    } else {
      setAvailableSlots([]);
    }
  }, [fetchedAvailableSlots, booking.timeSlot]);

  const loading = profileLoading;
  const error = profileError ? 'Failed to load doctor profile' : null;



  const generateAvailableDates = () => {
    const dates: Array<{ date: string; day: string; dayNum: number; monthName: string }> = [];
    const today = new Date();

    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);

      // Use local date parts to avoid UTC timezone shift
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const dayStr = date.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = date.getDate();
      const monthName = date.toLocaleDateString('en-US', { month: 'short' });
      const dayMonth = date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });

      dates.push({ date: dateStr, day: `${dayMonth} ${dayStr}`, dayNum, monthName });
    }

    setAvailableDates(dates);
    setBooking(prev => ({ ...prev, date: dates[0].date }));
  };

  const handleModeChange = (newMode: 'video' | 'voice') => {
    setBooking(prev => ({
      ...prev,
      mode: newMode,
      price: getPriceForDurationAndMode(prev.duration, newMode)
    }));
  };

  const handleDurationChange = (duration: number) => {
    if (!doctorProfile) return;
    setBooking(prev => ({
      ...prev,
      duration: duration as any,
      price: getPriceForDurationAndMode(duration, prev.mode)
    }));
  };

  const handleDateChange = (date: string) => {
    setBooking(prev => ({ ...prev, date }));
  };

  const handleTimeSlotChange = (timeSlot: string) => {
    setBooking(prev => ({ ...prev, timeSlot }));
  };

  const bookSessionMutation = useMutation({
    mutationFn: async (requestBody: any) => {
      const token = localStorage.getItem('token');
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const endpoint = isImmediate
        ? `${API_BASE_URL}/sessions/book-immediate`
        : `${API_BASE_URL}/sessions/book`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Booking failed. Please try again.');
      }
      return response.json();
    },
    onSuccess: (data) => {
      const sessionData = data.session;
      if (sessionData && sessionData.razorpayOrderId) {
        const options = {
          key: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_TCJDiOL4WcPBxR',
          amount: sessionData.price * 100,
          currency: 'INR',
          name: 'Veraawell',
          description: isImmediate ? 'Immediate Session' : 'Scheduled Session',
          order_id: sessionData.razorpayOrderId,
          handler: async function (response: any) {
            try {
              // Cryptographic verification
              const verifyRes = await fetch(`${API_BASE_URL}/payments/verify`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                })
              });
              const verifyData = await verifyRes.json();
              if (verifyData.success) {
                toast.success(isImmediate ? 'Payment confirmed! Joining session...' : 'Session scheduled successfully!');
                queryClient.invalidateQueries({ queryKey: ['patient', 'sessions'] });
                setTimeout(() => { 
                  if (isImmediate && sessionData._id) {
                    navigate(`/video-call/${sessionData._id}`);
                  } else {
                    navigate('/patient-dashboard'); 
                  }
                }, 1000);
              } else {
                toast.error('Payment verification failed: ' + (verifyData.message || 'Unknown error'));
              }
            } catch (err) {
              toast.error('Could not verify payment. Please contact support.');
            }
          },
          prefill: {
            name: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
            email: user?.email,
          },
          theme: {
            color: '#0d9488'
          },
          modal: {
            ondismiss: function() {
              toast.error('Payment cancelled. Session will be automatically removed if unpaid.');
              if (!isImmediate) {
                setTimeout(() => navigate('/patient-dashboard'), 1500);
              }
            }
          }
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.on('payment.failed', function (response: any) {
          toast.error('Payment failed: ' + response.error.description);
        });
        rzp.open();
      } else {
        const successMessage = isImmediate
          ? 'Requesting session... Waiting for doctor to join.'
          : 'Session scheduled! Check your dashboard for details.';
        toast.success(successMessage);
        queryClient.invalidateQueries({ queryKey: ['patient', 'sessions'] });
        setTimeout(() => { 
          if (isImmediate && sessionData?._id) {
            navigate(`/video-call/${sessionData._id}`);
          } else {
            navigate('/patient-dashboard'); 
          }
        }, 500);
      }
    },
    onError: (error: Error) => {
      console.error('Booking error:', error);
      toast.error(error.message || 'Failed to book session. Please try again.');
    }
  });

  const handleBookNow = () => {
    if (!isLoggedIn) {
      toast.error('Please log in or sign up to book a session');
      navigate('/login', {
        state: {
          from: location.pathname,
          serviceType,
          bookingType,
          message: 'Please login to book a session'
        }
      });
      return;
    }

    if (!isImmediate && (!booking.date || !booking.timeSlot)) {
      toast.error('Please select both date and time slot');
      return;
    }

    const requestBody = {
      doctorId,
      mode: booking.mode,
      duration: booking.duration,
      price: booking.price,
      ...(!isImmediate && {
        sessionDate: booking.date,
        sessionTime: booking.timeSlot,
        sessionType: 'scheduled',
        serviceType: serviceType || 'General'
      })
    };

    bookSessionMutation.mutate(requestBody);
  };

  const isBooking = bookSessionMutation.isPending;



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

  // Shared pill styling for the booking section — solid fill when selected,
  // soft tint (with a slightly deeper tint on hover) when not.
  const pillStyle = (active: boolean) => (
    active
      ? { backgroundColor: doctorColor, color: '#fff', boxShadow: `0 4px 12px ${doctorColor}40` }
      : { backgroundColor: `${doctorColor}12`, color: doctorColor }
  );
  const pillHoverHandlers = (active: boolean) => (
    active ? {} : {
      onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.backgroundColor = `${doctorColor}22`; },
      onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.backgroundColor = `${doctorColor}12`; },
    }
  );

  return (
    <div className="bg-white min-h-screen pt-16 md:pt-[80px]">
      <Helmet>
        <title>Dr. {doctorName} - {specializationText} | Veraawell</title>
        <meta name="description" content={`Book a session with Dr. ${doctorName}. ${experienceText} of experience in ${specializationText}.`} />
        <meta property="og:title" content={`Dr. ${doctorName} | Veraawell`} />
        <meta property="og:description" content={`Book a session with Dr. ${doctorName}.`} />
        {doctorProfile.profileImage && <meta property="og:image" content={doctorProfile.profileImage} />}
        <link rel="canonical" href={`https://veraawell.com/doctor/${doctorProfile._id}`} />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Physician",
                "name": `Dr. ${doctorName}`,
                "image": doctorProfile.profileImage,
                "description": doctorProfile.bio || `Specializes in ${specializationText}`,
                "medicalSpecialty": doctorProfile.specialization.length > 0 ? doctorProfile.specialization[0] : "General Practice",
                "aggregateRating": {
                  "@type": "AggregateRating",
                  "ratingValue": rating || 5,
                  "reviewCount": doctorProfile.rating.totalReviews || 1
                },
                "priceRange": `Rs. ${doctorProfile.pricing.min}+`
              },
              {
                "@type": "FAQPage",
                "mainEntity": [
                  {
                    "@type": "Question",
                    "name": "What should I expect in my first session?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text": "Your first session is primarily about getting to know each other. It's a safe space to discuss your background, the challenges you're currently facing, and what you hope to achieve through therapy. It's also an opportunity to see if you're a good fit for working together."
                    }
                  },
                  {
                    "@type": "Question",
                    "name": "How do I join the video or voice call?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text": "Once you book an appointment, you'll receive a confirmation email. At the time of your appointment, simply log in to your Veraawell dashboard and click 'Join Session' to enter the secure, encrypted call environment."
                    }
                  },
                  {
                    "@type": "Question",
                    "name": "What is the cancellation policy?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text": "We understand that plans change. You can reschedule or cancel your session up to 24 hours in advance without any penalty directly from your bookings dashboard. Late cancellations or missed appointments may be subject to a fee."
                    }
                  }
                ]
              }
            ]
          })}
        </script>
      </Helmet>
      {/* Hero Section with Background */}
      <div className="relative h-48 sm:h-56 md:h-64 lg:h-72 xl:h-80 overflow-hidden">
        <img
          src={doctorProfile.bannerImage || "/profile-bg.svg"}
          alt="Veraawell clinic background"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-opacity-30"></div>
      </div>

      {/* Profile Details Section */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 mb-12">
        
        {/* Profile Picture (Overlaps Banner) */}
        <div className="flex flex-col md:flex-row gap-6 md:gap-10">
          <div className="-mt-16 sm:-mt-20 md:-mt-24 shrink-0 relative z-20">
            <div 
              className="w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 rounded-full overflow-hidden bg-white border-4 sm:border-[6px] border-white shadow-md mx-auto md:mx-0"
            >
              <img
                src={doctorProfile.profileImage}
                alt={`Dr. ${doctorName}`}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Profile Info */}
          <div className="flex-1 w-full text-center md:text-left mt-2 md:mt-6">
            <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {doctorName}
                </h1>
                <div className="flex items-center justify-center md:justify-start gap-1.5 mt-1.5">
                  <div className="flex text-yellow-400">
                    {[...Array(5)].map((_, i) => (
                      <svg
                        key={i}
                        className={`w-4 h-4 sm:w-5 sm:h-5 ${i < fullStars ? 'fill-current' : 'fill-gray-200'}`}
                        viewBox="0 0 20 20"
                      >
                        <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                      </svg>
                    ))}
                  </div>
                  <span className="text-gray-600 font-medium text-sm sm:text-base ml-1">{rating.toFixed(2)}</span>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center justify-center md:justify-end gap-3 mt-4 md:mt-0">
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    toast.success('Profile link copied!');
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-full border border-gray-200 bg-white text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-all shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Share
                </button>
                <button 
                  onClick={() => {
                    document.getElementById('booking-section')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="flex items-center gap-2 px-6 py-2 rounded-full text-white font-semibold text-sm transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5"
                  style={{ backgroundColor: doctorColor }}
                >
                  Book Appointment
                </button>
              </div>
            </div>

            {/* Clean Info Layout */}
            <div className="flex flex-col gap-6 mt-8">
              <div className="flex flex-col sm:flex-row sm:items-start gap-6 sm:gap-16">
                <div>
                  <h3 className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-1.5">Experience</h3>
                  <p className="text-gray-800 font-semibold text-base">{experienceText}</p>
                </div>
                
                <div>
                  <h3 className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-1.5">Languages</h3>
                  <p className="text-gray-800 font-semibold text-base">{languagesText}</p>
                </div>
              </div>

              <div>
                <h3 className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-1.5">Qualifications</h3>
                <p className="text-gray-800 font-semibold text-base">
                  {doctorProfile.qualification.join(' • ')}
                </p>
              </div>

              <div>
                <h3 className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-2.5">Specializations</h3>
                <div className="flex flex-wrap justify-center md:justify-start gap-2">
                  {doctorProfile.specialization.map((spec, idx) => (
                    <span 
                      key={idx} 
                      className="px-4 py-1.5 rounded-full text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors cursor-default"
                    >
                      {spec}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quote and About Section */}
      <div className="mt-12 md:mt-16 py-10 md:py-16 px-4" style={{ backgroundColor: lightBgColor }}>
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-8 md:mb-10">
            <h2 className="text-2xl sm:text-3xl font-semibold italic leading-snug" style={{ color: doctorColor }}>
              "{doctorProfile.quote || 'Healing takes time, and asking for help is a courageous first step.'}"
            </h2>
            <p className="mt-4 text-gray-500 font-medium">
              — {doctorProfile.quote ? doctorProfile.quoteAuthor || 'Professional Philosophy' : 'Veraawell Philosophy'}
            </p>
          </div>
          
          <div className="text-gray-600 text-base sm:text-lg leading-relaxed space-y-4 max-w-3xl mx-auto">
            {doctorProfile.bio && doctorProfile.bio !== 'Profile not completed yet' ? (
              <p>{doctorProfile.bio}</p>
            ) : (
              <p>
                {doctorName} is a dedicated mental wellness professional{doctorProfile.specialization?.length > 0 ? ` specializing in ${doctorProfile.specialization[0]}` : ''}. They believe that every individual possesses the inherent strength for growth and healing. By fostering a compassionate, judgment-free environment, they work collaboratively with you to navigate life's challenges, uncover your inner resilience, and build a deeply fulfilling, balanced life.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Booking Section */}
      <div id="booking-section" className="py-12 md:py-16 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Card */}
            <div
              className="rounded-3xl p-8 shadow-sm hover:shadow-md transition-shadow duration-300 relative overflow-hidden border"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="space-y-8 relative z-10">
                {/* Select Mode */}
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center">
                  <h3 className="font-bold text-base sm:text-lg w-auto sm:w-36 shrink-0" style={{ color: 'var(--text)' }}>Select Mode:</h3>
                  <div className="flex flex-nowrap gap-2 w-full overflow-x-auto pb-1">
                    <button
                      onClick={() => handleModeChange('video')}
                      className="flex items-center gap-2 font-semibold py-1.5 px-4 sm:py-2 sm:px-5 rounded-full transition-all duration-300 whitespace-nowrap text-sm sm:text-base"
                      style={pillStyle(booking.mode === 'video')}
                      {...pillHoverHandlers(booking.mode === 'video')}
                    >
                      <FiVideo size={15} />
                      Video Call
                    </button>
                    <button
                      onClick={() => handleModeChange('voice')}
                      className="flex items-center gap-2 font-semibold py-1.5 px-4 sm:py-2 sm:px-5 rounded-full transition-all duration-300 whitespace-nowrap text-sm sm:text-base"
                      style={pillStyle(booking.mode === 'voice')}
                      {...pillHoverHandlers(booking.mode === 'voice')}
                    >
                      <FiPhone size={15} />
                      Voice Call
                    </button>
                  </div>
                </div>

                {/* Select Duration */}
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center">
                  <h3 className="font-bold text-base sm:text-lg w-auto sm:w-36 shrink-0" style={{ color: 'var(--text)' }}>Select Duration:</h3>
                  <div className="flex flex-nowrap gap-2 w-full overflow-x-auto pb-1">
                    {[20, 40, 55].map((dur) => (
                      <button
                        key={dur}
                        onClick={() => handleDurationChange(dur)}
                        className="font-semibold py-1.5 px-3 sm:py-2 sm:px-4 rounded-full transition-all duration-300 whitespace-nowrap text-sm sm:text-base"
                        style={pillStyle(booking.duration === dur)}
                        {...pillHoverHandlers(booking.duration === dur)}
                      >
                        {dur} Mins
                      </button>
                    ))}
                  </div>
                </div>

                {/* Price */}
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center">
                  <h3 className="font-bold text-base sm:text-lg w-auto sm:w-36 shrink-0" style={{ color: 'var(--text)' }}>Price:</h3>
                  <div className="flex flex-nowrap gap-2 w-full overflow-x-auto pb-1">
                    {[20, 40, 55].map((dur) => (
                      <div
                        key={`price-${dur}`}
                        className="font-semibold py-1.5 px-3 sm:py-2 sm:px-4 rounded-full transition-all duration-300 flex flex-col items-center min-w-[75px] sm:min-w-[90px] whitespace-nowrap"
                        style={pillStyle(booking.duration === dur)}
                      >
                        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider opacity-80 mb-0.5">{dur} Mins</span>
                        <span className="text-xs sm:text-sm">Rs. {getPriceForDurationAndMode(dur, booking.mode)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-6 mt-8 border-t" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-sm font-medium leading-relaxed" style={{ color: 'var(--text-2)' }}>
                    <span className="font-bold" style={{ color: 'var(--text)' }}>Note:</span> The session for the duration of 20 minutes is a discovery session where you can discuss your problems and discuss the way forward.
                  </p>
                </div>
              </div>
            </div>

            {/* Right Card */}
            <div
              className="rounded-3xl p-8 shadow-sm hover:shadow-md transition-shadow duration-300 relative overflow-hidden border flex flex-col justify-between"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="space-y-8 relative z-10 flex-1 flex flex-col justify-center">
                {/* Immediate booking: show instant session card. Scheduled: show date + slot picker. */}
                {isImmediate ? (
                  <div className="text-center">
                    <div
                      className="rounded-2xl p-8 mb-2"
                      style={{ background: `${doctorColor}0d` }}
                    >
                      <div className="relative inline-flex mb-4">
                        <div
                          className="w-16 h-16 rounded-2xl flex items-center justify-center"
                          style={{ backgroundColor: `${doctorColor}18` }}
                        >
                          <FiZap size={28} style={{ color: doctorColor }} />
                        </div>
                        <span className="absolute -top-1 -right-1 flex h-4 w-4">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: '#10B981' }} />
                          <span className="relative inline-flex rounded-full h-4 w-4 border-2 border-white" style={{ backgroundColor: '#10B981' }} />
                        </span>
                      </div>
                      <h3 className="text-2xl font-bold mb-2 tracking-tight" style={{ color: 'var(--text)' }}>Instant Session</h3>
                      <p className="text-sm leading-relaxed max-w-sm mx-auto" style={{ color: 'var(--text-2)' }}>This doctor is available now. Click "Book Now" to start your session immediately!</p>
                    </div>
                  </div>
                ) : (
                  /* Scheduled booking — 14-day date strip + slot grid */
                  <div className="space-y-8">
                    {/* Select Date */}
                    <div>
                      <h3 className="font-bold text-lg mb-4" style={{ color: 'var(--text)' }}>Select Date:</h3>
                      <div
                        className="flex space-x-3 overflow-x-auto pb-2 scrollbar-hide"
                        style={{ WebkitOverflowScrolling: 'touch' }}
                      >
                        {availableDates.map((dateObj) => (
                          <button
                            key={dateObj.date}
                            onClick={() => handleDateChange(dateObj.date)}
                            className="font-semibold py-3 px-3 rounded-2xl text-center flex-shrink-0 transition-all duration-300 flex flex-col items-center min-w-[64px]"
                            style={pillStyle(booking.date === dateObj.date)}
                            {...pillHoverHandlers(booking.date === dateObj.date)}
                          >
                            <span className="text-[10px] font-bold uppercase opacity-80 mb-1">{dateObj.day.split(' ')[1]?.toUpperCase()}</span>
                            <span className="text-2xl font-bold leading-none mb-1">{dateObj.dayNum}</span>
                            <span className="text-[10px] font-medium opacity-80">{dateObj.monthName}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Select Slot */}
                    <div>
                      <h3 className="font-bold text-lg mb-4" style={{ color: 'var(--text)' }}>Select Slot:</h3>
                      <div className="flex flex-wrap gap-3">
                        {availableSlots.length > 0 ? availableSlots.map((slot) => (
                          <button
                            key={slot}
                            onClick={() => handleTimeSlotChange(slot)}
                            className="font-semibold py-2 px-6 rounded-full transition-all duration-300"
                            style={pillStyle(booking.timeSlot === slot)}
                            {...pillHoverHandlers(booking.timeSlot === slot)}
                          >
                            {slot}
                          </button>
                        )) : (
                          <p className="italic text-sm p-4 rounded-xl" style={{ color: 'var(--text-2)', background: `${doctorColor}0d` }}>
                            {booking.date ? 'No available slots for this date' : 'Select a date to see slots'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Book Button */}
              <div className="mt-8 relative z-10 w-full">
                {(() => {
                  const bookDisabled = isImmediate ? isBooking : (isBooking || !booking.date || !booking.timeSlot);
                  return (
                    <button
                      onClick={handleBookNow}
                      disabled={bookDisabled}
                      className={`${bookDisabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'} font-bold py-4 px-10 rounded-full text-lg transition-all duration-300 w-full`}
                      style={{
                        border: `2px solid ${doctorColor}`,
                        color: doctorColor,
                        background: 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (bookDisabled) return;
                        e.currentTarget.style.background = doctorColor;
                        e.currentTarget.style.color = '#fff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = doctorColor;
                      }}
                    >
                      {isBooking ? 'Booking...' : isImmediate ? 'Book Now' : 'Schedule Session'}
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reviews Section */}
      <div className="py-12 md:py-16" style={{ backgroundColor: lightBgColor }}>
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
            <div 
              className="flex overflow-x-auto space-x-6 sm:space-x-8 pb-4"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {doctorReviews.map((review) => (
                <div key={review._id} className="bg-white p-6 rounded-lg shadow-md flex-shrink-0 w-[85vw] sm:w-80">
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

      {/* FAQ Accordion Section */}
      <div className="max-w-3xl mx-auto px-4 py-20 mb-10">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
            Frequently Asked Questions
          </h2>
          <p className="text-gray-500 mt-3 text-sm sm:text-base">Everything you need to know about booking and therapy sessions.</p>
        </div>
        <div className="space-y-4">
          {[
            {
              q: "What should I expect in my first session?",
              a: "Your first session is primarily about getting to know each other. It's a safe space to discuss your background, the challenges you're currently facing, and what you hope to achieve through therapy. It's also an opportunity to see if you're a good fit for working together."
            },
            {
              q: "How do I join the video or voice call?",
              a: "Once you book an appointment, you'll receive a confirmation email. At the time of your appointment, simply log in to your Veraawell dashboard and click \"Join Session\" to enter the secure, encrypted call environment."
            },
            {
              q: "What is the cancellation policy?",
              a: "We understand that plans change. You can reschedule or cancel your session up to 24 hours in advance without any penalty directly from your bookings dashboard. Late cancellations or missed appointments may be subject to a fee."
            }
          ].map((faq, idx) => (
            <div 
              key={idx} 
              className={`border transition-all duration-300 rounded-2xl overflow-hidden ${openFaq === idx ? 'border-teal-500/30 bg-teal-50/30 shadow-sm' : 'border-gray-100 bg-white hover:border-gray-200'}`}
            >
              <button
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="w-full flex items-center justify-between p-5 text-left focus:outline-none"
              >
                <span className={`font-semibold text-[15px] ${openFaq === idx ? 'text-teal-900' : 'text-gray-800'}`}>
                  {faq.q}
                </span>
                <div className={`ml-4 shrink-0 transition-transform duration-300 ${openFaq === idx ? 'rotate-180 text-teal-600' : 'text-gray-400'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </button>
              <div 
                className={`transition-all duration-300 ease-in-out ${openFaq === idx ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'}`}
              >
                <div className="px-5 pb-5 text-gray-600 text-sm leading-relaxed">
                  {faq.a}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DoctorProfilePage;
