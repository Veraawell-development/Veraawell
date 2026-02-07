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
        {/* Gradient Header */}
        <div
          className="relative h-32 overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #7DA9A7 0%, #6A9694 50%, #5A8684 100%)'
          }}
        >
          {/* Decorative circles */}
          <div
            className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-20"
            style={{ backgroundColor: 'white' }}
          />
          <div
            className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full opacity-10"
            style={{ backgroundColor: 'white' }}
          />

          {/* Close button */}
          {showClose && (
            <button
              type="button"
              aria-label="Close modal"
              onClick={handleClose}
              className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Content */}
        <div className="px-8 pb-10 -mt-8">
          {/* Avatar/Icon */}
          <div className="flex justify-center mb-6">
            <div
              className="w-20 h-20 rounded-full bg-white shadow-lg flex items-center justify-center"
              style={{
                boxShadow: '0 10px 25px -5px rgba(125, 169, 167, 0.3)'
              }}
            >
              <svg
                className="w-10 h-10"
                style={{ color: '#7DA9A7' }}
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
          </div>

          {/* Text Content */}
          <div className="text-center space-y-3 mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              Welcome, {user?.firstName || 'there'}!
            </h1>
            <p className="text-base text-gray-600 leading-relaxed max-w-md mx-auto">
              Let's get started by setting up your profile. This helps us personalize your experience and connect you with the right support.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleSetupProfile}
              className="w-full py-3.5 px-6 text-white text-base font-semibold rounded-xl shadow-md transition-all duration-200 transform hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-offset-2"
              style={{
                backgroundColor: '#7DA9A7',
                boxShadow: '0 4px 14px 0 rgba(125, 169, 167, 0.39)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#6A9694';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#7DA9A7';
              }}
            >
              Set Up My Profile
            </button>

            {showClose && (
              <button
                onClick={handleClose}
                className="w-full py-3 px-6 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-200"
              >
                I'll do this later
              </button>
            )}
          </div>

          {/* Info Badge */}
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-500">
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
