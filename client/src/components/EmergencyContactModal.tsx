import React, { useState } from 'react';
import { IoClose } from 'react-icons/io5';

interface EmergencyContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (contactName: string, contactPhone: string) => void;
}

const EmergencyContactModal: React.FC<EmergencyContactModalProps> = ({ 
  isOpen, 
  onClose, 
  onSubmit 
}) => {
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [errors, setErrors] = useState({ name: '', phone: '' });

  if (!isOpen) return null;

  const validateForm = () => {
    const newErrors = { name: '', phone: '' };
    let isValid = true;

    if (!contactName.trim()) {
      newErrors.name = 'Emergency contact name is required';
      isValid = false;
    }

    if (!contactPhone.trim()) {
      newErrors.phone = 'Emergency contact phone is required';
      isValid = false;
    } else if (!/^\d{10}$/.test(contactPhone.replace(/\D/g, ''))) {
      newErrors.phone = 'Please enter a valid 10-digit phone number';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit(contactName, contactPhone);
      setContactName('');
      setContactPhone('');
      setErrors({ name: '', phone: '' });
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 10) {
      setContactPhone(value);
    }
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
              Emergency Contact Information
            </h2>
            <p className="text-sm text-gray-600 mt-2" style={{ fontFamily: 'Inter, sans-serif' }}>
              Please provide an emergency contact in case immediate assistance is needed
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6">
            {/* Contact Name */}
            <div className="mb-5">
              <label 
                htmlFor="contactName" 
                className="block text-sm font-medium text-gray-700 mb-2"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                Emergency Contact Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="contactName"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                placeholder="Full name of emergency contact"
                style={{ fontFamily: 'Inter, sans-serif' }}
              />
              {errors.name && (
                <p className="text-red-500 text-sm mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {errors.name}
                </p>
              )}
            </div>

            {/* Contact Phone */}
            <div className="mb-6">
              <label 
                htmlFor="contactPhone" 
                className="block text-sm font-medium text-gray-700 mb-2"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                Emergency Contact Phone <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                id="contactPhone"
                value={contactPhone}
                onChange={handlePhoneChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                placeholder="10-digit phone number"
                style={{ fontFamily: 'Inter, sans-serif' }}
              />
              {errors.phone && (
                <p className="text-red-500 text-sm mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {errors.phone}
                </p>
              )}
            </div>

            {/* Info Box */}
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-800" style={{ fontFamily: 'Inter, sans-serif' }}>
                <strong>Why we need this:</strong> This contact will only be reached in case of a mental health emergency 
                or if your therapist believes you need immediate support.
              </p>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-full font-medium hover:bg-gray-50 transition-all"
                style={{ fontFamily: 'Bree Serif, serif' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-6 py-3 text-white rounded-full font-medium hover:opacity-90 transition-all"
                style={{ backgroundColor: '#38ABAE', fontFamily: 'Bree Serif, serif' }}
              >
                Continue
              </button>
            </div>
          </form>
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

export default EmergencyContactModal;
