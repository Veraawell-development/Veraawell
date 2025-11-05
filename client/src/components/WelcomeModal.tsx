import React from 'react';
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

  if (!isOpen) return null;

  const handleSetupProfile = () => {
    onClose();
    navigate('/profile-setup');
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
      <div className="relative bg-white rounded-2xl shadow-2xl p-12 max-w-2xl w-full mx-4 border-4" style={{ borderColor: '#7DA9A7' }}>
        {/* Close button */}
        {showClose && (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
        <div className="text-center space-y-6">
          <h1 className="text-4xl font-bold text-gray-800 font-serif">
            Hi {user?.firstName || 'there'}!
          </h1>
          <h2 className="text-3xl font-semibold text-gray-700 font-serif">
            Welcome to Veraawell
          </h2>
          <p className="text-xl text-gray-600 font-serif">
            Kindly start by setting up profile
          </p>
          
          <button
            onClick={handleSetupProfile}
            className="mt-8 px-10 py-4 text-white text-lg font-semibold rounded-full shadow-lg transition-all duration-300 transform hover:scale-105 font-serif"
            style={{ backgroundColor: '#7DA9A7' }}
          >
            Set My Profile
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomeModal;
