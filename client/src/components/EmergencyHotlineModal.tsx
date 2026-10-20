import React, { useEffect } from 'react';
import { IoClose } from 'react-icons/io5';
import { HELPLINES } from '../data/helplines';

interface EmergencyHotlineModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const EmergencyHotlineModal: React.FC<EmergencyHotlineModalProps> = ({ 
  isOpen, 
  onClose 
}) => {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // One list for every screen (data/helplines.ts); India first.
  const hotlines = HELPLINES;

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
          role="dialog"
          aria-modal="true"
          aria-labelledby="hotline-title"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative px-8 pt-8 pb-4">
            <button
              onClick={onClose}
              className="absolute top-6 right-6 text-gray-300 hover:text-gray-600 transition-colors"
              aria-label="Close helplines"
              autoFocus
            >
              <IoClose size={24} />
            </button>
            
            <h2 id="hotline-title" className="text-xl font-bold text-gray-900 tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
              Emergency Helplines
            </h2>
            <p className="text-sm text-gray-500 mt-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>
              If you are in danger or thinking of harming yourself, call now — you don't have to wait for your session.
            </p>
          </div>

          {/* Content */}
          <div className="px-8 pb-8">
            <div className="flex flex-col gap-5 mt-2">
              {hotlines.map((hotline) => (
                <div key={hotline.tel} className="flex flex-col gap-0.5">
                  <p className="text-[13px] text-gray-500 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {hotline.name}
                  </p>
                  <a
                    href={`tel:${hotline.tel}`}
                    className="text-lg font-semibold text-[#38ABAE] hover:text-[#2A8285] transition-colors"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    {hotline.number}
                  </a>
                  <p className="text-xs text-gray-400">{hotline.hours}</p>
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
