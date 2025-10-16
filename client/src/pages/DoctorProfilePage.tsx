import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface BookingState {
  mode: 'video' | 'voice';
  duration: 65 | 40 | 25;
  price: number;
  date: string;
  timeSlot: string;
}

const DoctorProfilePage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { doctorId, serviceType, bookingType } = (location.state as any) || {};

  const [booking, setBooking] = useState<BookingState>({
    mode: 'video',
    duration: 65,
    price: 2000,
    date: '',
    timeSlot: ''
  });

  const [availableDates, setAvailableDates] = useState<Array<{ date: string; day: string }>>([]);
  const [availableSlots] = useState(['09:00 AM', '11:00 AM', '03:00 PM', '05:00 PM']);
  const [isBooking, setIsBooking] = useState(false);

  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5001/api' 
    : 'https://veraawell-backend.onrender.com/api';

  useEffect(() => {
    generateAvailableDates();
  }, []);

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
      setBooking(prev => ({ ...prev, date: dates[0].date, timeSlot: availableSlots[0] }));
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
    if (!booking.date || !booking.timeSlot) {
      alert('Please select both date and time slot');
      return;
    }

    setIsBooking(true);

    try {
      // Mock payment for now
      const paymentSuccess = true;

      if (paymentSuccess) {
        const response = await fetch(`${API_BASE_URL}/sessions/book`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            doctorId,
            sessionDate: booking.date,
            sessionTime: booking.timeSlot,
            sessionType: bookingType === 'now' ? 'immediate' : 'scheduled',
            mode: booking.mode,
            duration: booking.duration,
            price: booking.price,
            serviceType: serviceType || 'General'
          })
        });

        if (response.ok) {
          alert('Session booked successfully!');
          navigate('/patient-dashboard');
        } else {
          const error = await response.json();
          alert(`Booking failed: ${error.message || 'Please try again'}`);
        }
      }
    } catch (error) {
      console.error('Booking error:', error);
      alert('Failed to book session. Please try again.');
    } finally {
      setIsBooking(false);
    }
  };

  const handleInstantBook = async () => {
    setIsBooking(true);

    try {
      const response = await fetch(`${API_BASE_URL}/sessions/book-immediate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          doctorId: doctorId || 'test-doctor-id'
        })
      });

      if (response.ok) {
        await response.json();
        alert('Instant session booked! You can join now from your dashboard.');
        navigate('/patient-dashboard');
      } else {
        const error = await response.json();
        alert(`Instant booking failed: ${error.message || 'Please try again'}`);
      }
    } catch (error) {
      console.error('Instant booking error:', error);
      alert('Failed to book instant session. Please try again.');
    } finally {
      setIsBooking(false);
    }
  };

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
              <img src="/doctor-01.svg" alt="Dr. Isha Sharma" className="w-full h-full object-cover" />
            </div>
          </div>

          {/* Profile Info */}
          <div className="w-2/3 pl-12 pb-4">
            <div className="flex justify-between items-center">
              <h1 className="text-5xl font-bold text-gray-800">Isha Sharma</h1>
              <div className="flex text-yellow-500">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-8 h-8 fill-current" viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/></svg>
                ))}
              </div>
            </div>
            <div className="mt-4 text-lg text-gray-700 space-y-2">
              <p><span className="font-bold">Experience:</span> 5+ years</p>
              <p><span className="font-bold">Qualification:</span> M. Phil, M. sc</p>
              <p><span className="font-bold">Specialization:</span> Depressive Disorders, Dysphoric Disorder</p>
              <p><span className="font-bold">Languages:</span> Hindi, English</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quote and About Section */}
      <div className="mt-16 py-16 px-4" style={{ backgroundColor: '#E3F0F0' }}>
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-semibold italic mb-8" style={{ color: '#38ABAE' }}>
            "Who looks outside, dreams; who looks inside, awakes"
          </h2>
          <div className="text-gray-600 text-lg leading-relaxed space-y-4">
            <p>At Veraawell, we believe mental wellness is not a luxury — it's a necessity. Our mission is simple: to make professional psychological support accessible, reliable, and timely for everyone who needs it.</p>
            <p>We connect you with highly qualified and compassionate psychologists who specialize in understanding your unique needs. Whether you're seeking help for anxiety, depression, stress, relationship issues, or personal growth, our experts are here to guide you — right when you need them.</p>
            <p>We know that mental health struggles can't always wait, so we ensure timely consultations, flexible scheduling, and a safe, judgment-free space for every individual.</p>
          </div>
        </div>
      </div>

      {/* Booking Section */}
      <div className="py-16 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Card */}
            <div className="bg-[#4DBAB2] rounded-2xl p-8 text-white shadow-2xl">
              <div className="space-y-8">
                {/* Select Mode */}
                <div className="flex items-center">
                  <h3 className="font-bold text-xl w-1/3">Select Mode:</h3>
                  <div className="flex space-x-3">
                    <button 
                      onClick={() => handleModeChange('video')}
                      className={`${booking.mode === 'video' ? 'bg-white ring-2 ring-blue-400' : 'bg-[#E0F7FA]'} text-[#38ABAE] font-semibold py-2 px-5 rounded-full shadow-inner transition-all`}
                    >
                      Video Call
                    </button>
                    <button 
                      onClick={() => handleModeChange('voice')}
                      className={`${booking.mode === 'voice' ? 'bg-white ring-2 ring-blue-400' : 'bg-[#E0F7FA]'} text-[#38ABAE] font-semibold py-2 px-5 rounded-full shadow-inner transition-all`}
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
                    >
                      65 Minutes
                    </button>
                    <button 
                      onClick={() => handleDurationChange(40)}
                      className={`${booking.duration === 40 ? 'bg-white ring-2 ring-blue-400' : 'bg-[#E0F7FA]'} text-[#38ABAE] font-semibold py-2 px-5 rounded-full shadow-inner transition-all`}
                    >
                      40 Minutes
                    </button>
                    <button 
                      onClick={() => handleDurationChange(25)}
                      className={`${booking.duration === 25 ? 'bg-white ring-2 ring-blue-400' : 'bg-[#E0F7FA]'} text-[#38ABAE] font-semibold py-2 px-5 rounded-full shadow-inner transition-all`}
                    >
                      25 Minutes
                    </button>
                  </div>
                </div>
                {/* Price */}
                <div className="flex items-center">
                  <h3 className="font-bold text-xl w-1/3">Price:</h3>
                  <div className="flex space-x-3">
                    <div className="bg-[#E0F7FA] text-[#38ABAE] font-semibold py-2 px-5 rounded-full shadow-inner">
                      Rs. {booking.price}
                    </div>
                  </div>
                </div>
                <p className="text-sm pt-4 font-medium">Note: The session for the duration of 25 minutes is a discovery session where you can discuss your problems and discuss the way forward.</p>
              </div>
            </div>

            {/* Right Card */}
            <div className="bg-[#4DBAB2] rounded-2xl p-8 text-white shadow-2xl">
              <div className="space-y-8">
                {/* Select Date */}
                <div>
                  <h3 className="font-bold text-xl mb-4">Select Date:</h3>
                  <div className="flex space-x-3 overflow-x-auto pb-2">
                    {availableDates.map((dateObj) => (
                      <button
                        key={dateObj.date}
                        onClick={() => handleDateChange(dateObj.date)}
                        className={`${booking.date === dateObj.date ? 'bg-white ring-2 ring-blue-400' : 'bg-[#E0F7FA]'} text-[#38ABAE] font-semibold py-2 px-4 rounded-lg text-center flex-shrink-0 shadow-inner transition-all`}
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
                    {availableSlots.map((slot) => (
                      <button
                        key={slot}
                        onClick={() => handleTimeSlotChange(slot)}
                        className={`${booking.timeSlot === slot ? 'bg-white ring-2 ring-blue-400' : 'bg-[#E0F7FA]'} text-[#38ABAE] font-semibold py-2 px-5 rounded-full shadow-inner transition-all`}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="text-center pt-4 space-y-3">
                  <button 
                    onClick={handleBookNow}
                    disabled={isBooking || !booking.date || !booking.timeSlot}
                    className={`${isBooking || !booking.date || !booking.timeSlot ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white hover:scale-105'} bg-[#E0F7FA] text-[#38ABAE] font-bold py-3 px-10 rounded-full shadow-md text-xl transition-all w-full`}
                  >
                    {isBooking ? 'Booking...' : 'Book Now'}
                  </button>
                  
                  <button 
                    onClick={handleInstantBook}
                    disabled={isBooking}
                    className={`${isBooking ? 'opacity-50 cursor-not-allowed' : 'hover:bg-yellow-400 hover:scale-105'} bg-yellow-300 text-gray-800 font-bold py-3 px-10 rounded-full shadow-md text-xl transition-all w-full`}
                  >
                    {isBooking ? 'Booking...' : '⚡ Instant Book (Test Video Call)'}
                  </button>
                  
                  <p className="text-sm text-white mt-2">
                    💡 Use "Instant Book" to create a session you can join immediately for testing
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reviews Section */}
      <div className="py-16" style={{ backgroundColor: '#E3F0F0' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex overflow-x-auto space-x-8 pb-4">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="bg-white p-6 rounded-lg shadow-md flex-shrink-0 w-80">
                <h3 className="text-2xl font-bold mb-2" style={{ color: '#38ABAE' }}>
                  {index % 2 === 0 ? 'Neha' : 'Karan'}
                </h3>
                <div className="flex text-yellow-500 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-6 h-6 fill-current" viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/></svg>
                  ))}
                </div>
                <p className="text-gray-600 italic leading-relaxed">
                  "I came in feeling lost, and today I feel stronger and more in control of my life. Thank you, Veraawell, for your guidance and patience."
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoctorProfilePage;
