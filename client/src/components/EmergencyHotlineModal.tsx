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
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div 
          className="bg-white rounded-[24px] shadow-[0_8px_40px_rgba(0,0,0,0.06)] w-full max-w-[400px] pointer-events-auto animate-fade-up overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative px-8 pt-8 pb-4">
            <button
              onClick={onClose}
              className="absolute top-6 right-6 text-gray-300 hover:text-gray-600 transition-colors"
              aria-label="Close modal"
            >
              <IoClose size={24} />
            </button>
            
            <h2 className="text-xl font-bold text-gray-900 tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
              Emergency Helplines
            </h2>
            <p className="text-sm text-gray-500 mt-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>
              Help is available 24/7
            </p>
          </div>

          {/* Content */}
          <div className="px-8 pb-8">
            <div className="flex flex-col gap-5 mt-2">
              {hotlines.map((hotline, index) => (
                <div key={index} className="flex flex-col gap-0.5">
                  <p className="text-[13px] text-gray-500 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {hotline.name}
                  </p>
                  <a 
                    href={`tel:${hotline.number.replace(/[^0-9]/g, '')}`}
                    className="text-lg font-semibold text-[#38ABAE] hover:text-[#2A8285] transition-colors"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    {hotline.number}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fade-up {
          0% {
            opacity: 0;
            transform: translateY(10px) scale(0.98);
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

export default EmergencyHotlineModal;
