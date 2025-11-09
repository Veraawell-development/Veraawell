import React from 'react';
import { IoClose } from 'react-icons/io5';

interface EmergencyHotlineModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const EmergencyHotlineModal: React.FC<EmergencyHotlineModalProps> = ({ 
  isOpen, 
  onClose 
}) => {
  if (!isOpen) return null;

  const hotlines = [
    {
      name: 'National Suicide Prevention Lifeline',
      number: '1-800-273-8255'
    },
    {
      name: 'Crisis Text Line',
      number: 'Text HOME to 741741'
    },
    {
      name: 'Vandrevala Foundation (India)',
      number: '1860-2662-345'
    },
    {
      name: 'iCall (India)',
      number: '022-25521111'
    }
  ];

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
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md pointer-events-auto animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative px-6 py-5 border-b border-gray-200">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close modal"
            >
              <IoClose size={24} />
            </button>
            <h2 className="text-2xl font-semibold pr-8" style={{ color: '#38ABAE', fontFamily: 'Bree Serif, serif' }}>
              Emergency Helplines
            </h2>
            <p className="text-sm text-gray-600 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
              Help is available 24/7
            </p>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Hotline List */}
            <div className="space-y-4 mb-6">
              {hotlines.map((hotline, index) => (
                <div key={index}>
                  <p className="text-sm text-gray-600 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {hotline.name}
                  </p>
                  <a 
                    href={`tel:${hotline.number.replace(/[^0-9]/g, '')}`}
                    className="text-xl font-semibold block hover:underline"
                    style={{ color: '#38ABAE', fontFamily: 'Bree Serif, serif' }}
                  >
                    {hotline.number}
                  </a>
                </div>
              ))}
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="w-full px-6 py-3 text-white rounded-full font-medium hover:opacity-90 transition-all"
              style={{ backgroundColor: '#38ABAE', fontFamily: 'Bree Serif, serif' }}
            >
              Close
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.95);
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

export default EmergencyHotlineModal;
