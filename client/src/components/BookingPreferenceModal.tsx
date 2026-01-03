import React from 'react';
import { useNavigate } from 'react-router-dom';
import { IoClose } from 'react-icons/io5';
import { useAuth } from '../context/AuthContext';

interface BookingPreferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  serviceType?: string;
}

const BookingPreferenceModal: React.FC<BookingPreferenceModalProps> = ({ 
  isOpen, 
  onClose, 
  serviceType = 'General' 
}) => {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();

  if (!isOpen) return null;

  const handleBookingChoice = (bookingType: 'now' | 'later') => {
    onClose();
    
    // Check if user is logged in
    if (!isLoggedIn) {
      // Redirect to login page with return URL
      navigate('/login', { 
        state: { 
          from: '/choose-professional',
          serviceType,
          bookingType,
          message: 'Please login to book a session'
        } 
      });
      return;
    }
    
    // User is logged in, proceed to choose professional
    navigate('/choose-professional', { 
      state: { 
        serviceType,
        bookingType 
      } 
    });
  };


  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div 
          className="bg-[#E0EAEA] p-8 rounded-2xl shadow-2xl w-full max-w-md text-center border-2 border-gray-200 relative pointer-events-auto animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="Close modal"
          >
            <IoClose size={24} />
          </button>

          {/* Service Type Header (if not General) */}
          {serviceType !== 'General' && (
            <h2 className="text-xl font-semibold text-gray-600 mb-4 font-bree-serif">
              Services / {serviceType}
            </h2>
          )}

          {/* Title */}
          <div className="bg-[#ABA5D1] text-white text-3xl font-bold py-4 px-10 rounded-xl shadow-md mb-12 inline-block border-2 border-purple-400 font-bree-serif">
            Booking Preference
          </div>

          {/* Book Now Option */}
          <div className="mb-12 flex flex-col items-center font-bree-serif">
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

          {/* Book Later Option */}
          <div className="flex flex-col items-center font-bree-serif">
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

      <style>{`
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }
      `}</style>
    </>
  );
};

export default BookingPreferenceModal;
