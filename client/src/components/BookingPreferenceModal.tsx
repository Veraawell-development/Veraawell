import React from 'react';
import { useNavigate } from 'react-router-dom';
import { IoClose } from 'react-icons/io5';
import { FiClock, FiCalendar } from 'react-icons/fi';

interface BookingPreferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  serviceType?: string;
}

// Design tokens — matches the patient dashboard's cream/teal design language.
const T = {
  bg: '#f6f3ec',
  border: 'rgba(27,43,46,.08)',
  text: '#16262a',
  text2: '#6b7573',
  muted: '#8a938f',
  teal: '#1f7a8c',
  tealHover: '#155e6c',
  tealBg: 'rgba(31,122,140,.08)',
  green: '#2fae7a',
  greenBg: '#eef6f0',
};
const FONT_SERIF = "'Newsreader', Georgia, serif";
const FONT_SANS = "'Public Sans', 'Inter', sans-serif";

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
        className="fixed inset-0 z-40 transition-opacity"
        style={{ background: 'rgba(22,38,42,.45)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="rounded-[24px] w-full max-w-[480px] pointer-events-auto animate-fade-up overflow-hidden flex flex-col relative"
          style={{ background: T.bg, boxShadow: '0 20px 60px rgba(27,43,46,.22)', border: `1px solid ${T.border}` }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative px-8 pt-8 pb-4">
            <button
              onClick={onClose}
              className="absolute top-6 right-6 p-2 rounded-full transition-all"
              style={{ background: '#fff', color: T.text2, border: `1px solid ${T.border}` }}
              aria-label="Close modal"
            >
              <IoClose size={20} />
            </button>

            {serviceType !== 'General' && (
              <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ fontFamily: FONT_SANS, color: T.teal }}>
                {serviceType}
              </p>
            )}

            <h2 style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 24, color: T.text }}>
              When do you need a session?
            </h2>
            <p className="text-[14.5px] mt-1.5" style={{ fontFamily: FONT_SANS, fontWeight: 500, color: T.text2 }}>
              Choose whether you'd like to talk to someone right now, or schedule a session for later.
            </p>
          </div>

          {/* Content Options */}
          <div className="p-8 pt-4 space-y-4">

            {/* Book Now Card - PRIMARY ACTION */}
            <button
              onClick={() => handleBookingChoice('now')}
              className="w-full flex items-start gap-4 p-5 rounded-[20px] transition-all duration-300 group text-left relative"
              style={{ background: '#fff', border: `1.5px solid ${T.teal}`, boxShadow: '0 4px 20px rgba(31,122,140,.1)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = T.tealBg; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 25px rgba(31,122,140,.18)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#fff'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 20px rgba(31,122,140,.1)'; }}
            >
              {/* Pulsing indicator */}
              <div className="absolute top-5 right-5 flex items-center gap-1.5 px-2 py-1 rounded-full" style={{ background: T.greenBg, border: `1px solid ${T.green}33` }}>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: T.green }}></span>
                  <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: T.green }}></span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ fontFamily: FONT_SANS, color: T.green }}>Live</span>
              </div>

              <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-300" style={{ background: T.teal }}>
                <FiClock className="w-5 h-5 text-white" />
              </div>
              <div className="pt-0.5 pr-14">
                <h3 className="mb-0.5" style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 16.5, color: T.text }}>
                  Talk to someone now
                </h3>
                <p className="text-[13px] leading-relaxed" style={{ fontFamily: FONT_SANS, fontWeight: 500, color: T.text2 }}>
                  See professionals currently online and available to join immediately.
                </p>
              </div>
            </button>

            {/* Book Later Card - SECONDARY ACTION */}
            <button
              onClick={() => handleBookingChoice('later')}
              className="w-full flex items-start gap-4 p-5 rounded-[20px] transition-all duration-300 group text-left"
              style={{ background: '#fff', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(27,43,46,.04)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 24px rgba(27,43,46,.08)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 1px 3px rgba(27,43,46,.04)'; }}
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-300" style={{ background: T.bg, border: `1px solid ${T.border}` }}>
                <FiCalendar className="w-5 h-5" style={{ color: T.text2 }} />
              </div>
              <div className="pt-0.5">
                <h3 className="mb-0.5" style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 16.5, color: T.text }}>
                  Schedule for later
                </h3>
                <p className="text-[13px] leading-relaxed" style={{ fontFamily: FONT_SANS, fontWeight: 500, color: T.text2 }}>
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
