import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  showClose?: boolean;
}

const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose, showClose = true }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSetupProfile = () => {
    setIsAnimating(false);
    setTimeout(() => {
      onClose();
      // Redirect based on user role
      if (user?.role === 'patient') {
        navigate('/patient-profile-setup');
      } else {
        navigate('/profile-setup');
      }
    }, 200);
  };

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(onClose, 200);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 transition-all duration-300 ${isAnimating ? 'opacity-100' : 'opacity-0'
        }`}
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)'
      }}
      onClick={showClose ? handleClose : undefined}
    >
      <div
        className={`relative bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden transition-all duration-300 ${isAnimating ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
          }`}
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
      >
        {/* Close button */}
        {showClose && (
          <button
            type="button"
            aria-label="Close modal"
            onClick={handleClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        {/* Content */}
        <div className="text-center mt-6 px-8 pb-8">
          {/* Icon */}
          <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-8 h-8 text-teal-600"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>

          {/* Text Content */}
          <h2 className="text-2xl font-bold text-gray-900 mb-2 font-sans">
            Welcome, {user?.firstName ? user.firstName.charAt(0).toUpperCase() + user.firstName.slice(1) : 'there'}!
          </h2>
          <p className="text-gray-600 text-sm leading-relaxed mb-8 font-sans">
            Let's get started by setting up your profile. This helps us personalize your experience and connect you with the right support.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col items-center space-y-3">
            <button
              onClick={handleSetupProfile}
              className="px-8 py-2.5 text-white text-sm font-semibold rounded-full bg-[#38ABAE] hover:bg-[#2C8E91] transition-colors focus:outline-none focus:ring-2 focus:ring-[#38ABAE] focus:ring-offset-2 font-sans"
            >
              Set Up My Profile
            </button>

            {showClose && (
              <button
                onClick={handleClose}
                className="text-gray-500 hover:text-gray-700 text-sm font-medium transition-colors font-sans"
              >
                I'll do this later
              </button>
            )}
          </div>

          {/* Info Badge */}
          <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-gray-500 font-sans">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>Takes less than 2 minutes</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeModal;
