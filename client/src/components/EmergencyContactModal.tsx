import React, { useState } from 'react';
import { IoClose } from 'react-icons/io5';
import { FiUser, FiPhone, FiHeart, FiShield } from 'react-icons/fi';

interface EmergencyContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (contactName: string, contactPhone: string, contactRelationship: string) => void;
}

const RELATIONSHIP_OPTIONS = ['Parent', 'Spouse', 'Sibling', 'Friend', 'Partner', 'Guardian', 'Other'];

const EmergencyContactModal: React.FC<EmergencyContactModalProps> = ({
  isOpen,
  onClose,
  onSubmit
}) => {
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactRelationship, setContactRelationship] = useState('');
  const [errors, setErrors] = useState({ name: '', phone: '', relationship: '' });

  if (!isOpen) return null;



  const validateForm = () => {
    const newErrors = { name: '', phone: '', relationship: '' };
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

    if (!contactRelationship.trim()) {
      newErrors.relationship = 'Relationship is required';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit(contactName, contactPhone, contactRelationship);
      setContactName('');
      setContactPhone('');
      setContactRelationship('');
      setErrors({ name: '', phone: '', relationship: '' });
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
          className="bg-white rounded-3xl shadow-2xl w-full max-w-md pointer-events-auto animate-scale-in overflow-hidden font-sans"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative px-7 pt-7 pb-6" style={{ background: 'linear-gradient(135deg, #F2FAF9 0%, #FFFFFF 70%)' }}>
            <button
              onClick={onClose}
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close modal"
            >
              <IoClose size={22} />
            </button>

            <div className="w-11 h-11 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(56,171,174,0.12)' }}>
              <FiShield className="w-5 h-5" style={{ color: '#38ABAE' }} />
            </div>

            <h2 className="text-[22px] font-bold text-gray-800 tracking-tight pr-8" style={{ fontFamily: 'Inter, sans-serif' }}>
              Emergency Contact
            </h2>
            <p className="text-sm text-gray-500 mt-1.5 leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
              Just in case we ever need to reach someone on your behalf — this only takes a moment.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-7 pb-7 pt-1">
            {/* Contact Name */}
            <div className="mb-4">
              <label
                htmlFor="contactName"
                className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                Full Name
              </label>
              <div className="relative">
                <FiUser className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  id="contactName"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all bg-gray-50/50 focus:bg-white"
                  placeholder="Jane Doe"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                />
              </div>
              {errors.name && (
                <p className="text-red-500 text-xs mt-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {errors.name}
                </p>
              )}
            </div>

            {/* Contact Phone */}
            <div className="mb-4">
              <label
                htmlFor="contactPhone"
                className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                Phone Number
              </label>
              <div className="relative">
                <FiPhone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="tel"
                  id="contactPhone"
                  value={contactPhone}
                  onChange={handlePhoneChange}
                  className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all bg-gray-50/50 focus:bg-white"
                  placeholder="10-digit phone number"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                />
              </div>
              {errors.phone && (
                <p className="text-red-500 text-xs mt-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {errors.phone}
                </p>
              )}
            </div>

            {/* Relationship */}
            <div className="mb-5">
              <label
                htmlFor="contactRelationship"
                className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                Relationship
              </label>
              <div className="relative">
                <FiHeart className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                <select
                  id="contactRelationship"
                  value={contactRelationship}
                  onChange={(e) => setContactRelationship(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all bg-gray-50/50 focus:bg-white appearance-none"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  <option value="">Select relationship</option>
                  {RELATIONSHIP_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              {errors.relationship && (
                <p className="text-red-500 text-xs mt-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {errors.relationship}
                </p>
              )}
            </div>

            {/* Info Box */}
            <div className="mb-6 p-3.5 rounded-xl border border-teal-100" style={{ background: 'rgba(56,171,174,0.06)' }}>
              <p className="text-xs text-gray-600 leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
                <strong className="text-gray-700">Why we ask:</strong> This contact is only reached in a mental health emergency, or if your therapist believes you need immediate support.
              </p>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-6 py-3 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-all"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-6 py-3 text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-sm"
                style={{ backgroundColor: '#38ABAE', fontFamily: 'Inter, sans-serif' }}
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
