import React from 'react';
import { useNavigate } from 'react-router-dom';
import { IoClose } from 'react-icons/io5';
import { FiClock, FiCalendar } from 'react-icons/fi';

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

  if (!isOpen) return null;

  const handleBookingChoice = (bookingType: 'now' | 'later') => {
    onClose();
    
    // Proceed to choose professional directly (guest user support)
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
        className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div 
          className="bg-white rounded-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-full max-w-[480px] pointer-events-auto animate-fade-up overflow-hidden border border-gray-100 flex flex-col relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative px-8 pt-8 pb-4">
            <button
              onClick={onClose}
              className="absolute top-6 right-6 p-2 bg-gray-50 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-all"
              aria-label="Close modal"
            >
              <IoClose size={20} />
            </button>
            
            {serviceType !== 'General' && (
              <p className="text-xs font-bold text-teal-600 uppercase tracking-wider mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                {serviceType}
              </p>
            )}
            
            <h2 className="text-[22px] font-bold text-gray-900 tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
              When do you need a session?
            </h2>
            <p className="text-[14.5px] text-gray-500 mt-1 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
              Choose whether you'd like to talk to someone right now, or schedule a session for later.
            </p>
          </div>

          {/* Content Options */}
          <div className="p-8 pt-4 space-y-4">
            
            {/* Book Now Card - PRIMARY ACTION */}
            <button 
              onClick={() => handleBookingChoice('now')} 
              className="w-full flex items-start gap-4 p-5 bg-white border-[1.5px] border-[#38ABAE] hover:bg-teal-50/30 rounded-[20px] transition-all duration-300 group text-left shadow-[0_4px_20px_rgba(56,171,174,0.12)] hover:shadow-[0_8px_25px_rgba(56,171,174,0.2)] relative"
            >
              {/* Pulsing indicator */}
              <div className="absolute top-5 right-5 flex items-center gap-1.5 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider" style={{ fontFamily: 'Inter, sans-serif' }}>Live</span>
              </div>

              <div className="w-12 h-12 rounded-full bg-[#38ABAE] shadow-sm flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-300">
                <FiClock className="w-5 h-5 text-white" />
              </div>
              <div className="pt-0.5 pr-14">
                <h3 className="text-[16px] font-bold text-gray-900 mb-0.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Talk to someone now
                </h3>
                <p className="text-[13px] text-gray-500 leading-relaxed font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                  See professionals currently online and available to join immediately.
                </p>
              </div>
            </button>

            {/* Book Later Card - SECONDARY ACTION */}
            <button 
              onClick={() => handleBookingChoice('later')}
              className="w-full flex items-start gap-4 p-5 bg-white border border-gray-100 hover:border-gray-200 hover:bg-gray-50/50 rounded-[20px] transition-all duration-300 group text-left shadow-sm hover:shadow-md"
            >
              <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center shrink-0 border border-gray-100 group-hover:scale-105 transition-transform duration-300">
                <FiCalendar className="w-5 h-5 text-gray-500" />
              </div>
              <div className="pt-0.5">
                <h3 className="text-[16px] font-bold text-gray-900 mb-0.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Schedule for later
                </h3>
                <p className="text-[13px] text-gray-500 leading-relaxed font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Browse availability calendars and book a session at a time that works best.
                </p>
              </div>
            </button>

          </div>
        </div>
      </div>

      <style>{`
        @keyframes fade-up {
          0% {
            opacity: 0;
            transform: translateY(20px) scale(0.96);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-fade-up {
          animation: fade-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </>
  );
};

export default BookingPreferenceModal;
