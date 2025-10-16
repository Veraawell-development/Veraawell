import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const BookingPreferencePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const serviceType = (location.state as any)?.serviceType || 'General';

  const handleBookingChoice = (bookingType: 'now' | 'later') => {
    navigate('/choose-professional', { 
      state: { 
        serviceType,
        bookingType 
      } 
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center py-12 px-4 font-bree-serif">
      <h1 className="text-2xl font-semibold text-gray-600 mb-6 self-start ml-4 md:ml-20">
        Services / {serviceType}
      </h1>
      <div className="bg-[#E0EAEA] p-8 rounded-2xl shadow-lg w-full max-w-md text-center border-2 border-gray-200">
        
        <div className="bg-[#ABA5D1] text-white text-3xl font-bold py-4 px-10 rounded-xl shadow-md mb-12 inline-block border-2 border-purple-400">
          Booking Preference
        </div>

        <div className="mb-12 flex flex-col items-center">
          <img src="/book_now.svg" alt="Book Now" className="h-20 mb-4" />
          <button 
            onClick={() => handleBookingChoice('now')} 
            className="bg-[#6DBEDF] text-white font-bold py-4 px-12 rounded-2xl text-2xl shadow-[inset_0_2px_4px_rgba(255,255,255,0.5),_0_4px_6px_rgba(0,0,0,0.1)] hover:bg-[#5AA8C7] transition-all duration-300 transform hover:scale-105 border-2 border-blue-300"
          >
            Book for Now
          </button>
          <p className="text-[#38ABAE] mt-4 text-xl">
            See the list of therapists currently online
          </p>
        </div>

        <div className="flex flex-col items-center">
          <img src="/cal.svg" alt="Calendar" className="h-16 mb-4" />
          <button 
            onClick={() => handleBookingChoice('later')}
            className="bg-[#6DBEDF] text-white font-bold py-4 px-12 rounded-2xl text-2xl shadow-[inset_0_2px_4px_rgba(255,255,255,0.5),_0_4px_6px_rgba(0,0,0,0.1)] hover:bg-[#5AA8C7] transition-all duration-300 transform hover:scale-105 border-2 border-blue-300"
          >
            Book for Later
          </button>
          <p className="text-[#38ABAE] mt-4 text-xl">
            Schedule your session as per your availability
          </p>
        </div>

      </div>
    </div>
  );
};

export default BookingPreferencePage;
