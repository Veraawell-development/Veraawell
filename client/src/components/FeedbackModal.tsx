import React, { useState } from 'react';
import { IoClose, IoStar, IoStarOutline } from 'react-icons/io5';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (feedback: {
    rating: number;
    feedback: string;
    positives: string;
    improvements: string;
    wouldRecommend: boolean;
  }) => void;
  doctorName: string;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ 
  isOpen, 
  onClose, 
  onSubmit,
  doctorName 
}) => {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [positives, setPositives] = useState('');
  const [improvements, setImprovements] = useState('');
  const [wouldRecommend, setWouldRecommend] = useState(true);
  const [errors, setErrors] = useState({ rating: '', feedback: '' });

  if (!isOpen) return null;

  const validateForm = () => {
    const newErrors = { rating: '', feedback: '' };
    let isValid = true;

    if (rating === 0) {
      newErrors.rating = 'Please select a rating';
      isValid = false;
    }

    if (!feedback.trim()) {
      newErrors.feedback = 'Please provide your feedback';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit({
        rating,
        feedback,
        positives,
        improvements,
        wouldRecommend
      });
      // Reset form
      setRating(0);
      setFeedback('');
      setPositives('');
      setImprovements('');
      setWouldRecommend(true);
      setErrors({ rating: '', feedback: '' });
    }
  };

  const renderStars = () => {
    return (
      <div className="flex gap-2 justify-center">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHoveredRating(star)}
            onMouseLeave={() => setHoveredRating(0)}
            className="transition-transform hover:scale-110"
          >
            {(hoveredRating || rating) >= star ? (
              <IoStar className="text-5xl text-yellow-400" />
            ) : (
              <IoStarOutline className="text-5xl text-gray-300" />
            )}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-teal-500 to-teal-600 p-6 rounded-t-2xl flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white" style={{ fontFamily: 'Bree Serif, serif' }}>
              Session Feedback
            </h2>
            <p className="text-teal-50 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
              How was your session with Dr. {doctorName}?
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
          >
            <IoClose size={28} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Rating */}
          <div>
            <label className="block text-center text-lg font-semibold text-gray-700 mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
              Rate Your Experience <span className="text-red-500">*</span>
            </label>
            {renderStars()}
            {rating > 0 && (
              <p className="text-center mt-2 text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                {rating === 5 && '⭐ Excellent!'}
                {rating === 4 && '😊 Very Good'}
                {rating === 3 && '👍 Good'}
                {rating === 2 && '😐 Fair'}
                {rating === 1 && '😞 Needs Improvement'}
              </p>
            )}
            {errors.rating && (
              <p className="text-red-500 text-sm text-center mt-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                {errors.rating}
              </p>
            )}
          </div>

          {/* Overall Feedback */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
              Overall Feedback <span className="text-red-500">*</span>
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all resize-none"
              placeholder="Share your overall experience with this session..."
              style={{ fontFamily: 'Inter, sans-serif' }}
            />
            {errors.feedback && (
              <p className="text-red-500 text-sm mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                {errors.feedback}
              </p>
            )}
          </div>

          {/* What Went Well */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
              What went well? (Optional)
            </label>
            <textarea
              value={positives}
              onChange={(e) => setPositives(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all resize-none"
              placeholder="What did you appreciate about this session?"
              style={{ fontFamily: 'Inter, sans-serif' }}
            />
          </div>

          {/* Areas for Improvement */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
              Areas for improvement (Optional)
            </label>
            <textarea
              value={improvements}
              onChange={(e) => setImprovements(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all resize-none"
              placeholder="What could be improved in future sessions?"
              style={{ fontFamily: 'Inter, sans-serif' }}
            />
          </div>

          {/* Would Recommend */}
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
            <input
              type="checkbox"
              id="wouldRecommend"
              checked={wouldRecommend}
              onChange={(e) => setWouldRecommend(e.target.checked)}
              className="w-5 h-5 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
            />
            <label htmlFor="wouldRecommend" className="text-sm font-medium text-gray-700" style={{ fontFamily: 'Inter, sans-serif' }}>
              I would recommend this doctor to others
            </label>
          </div>

          {/* Info Box */}
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800" style={{ fontFamily: 'Inter, sans-serif' }}>
              <strong>Your feedback matters!</strong> This review will help us improve our services and assist other patients in choosing the right therapist.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Skip for Now
            </button>
            <button
              type="submit"
              className="flex-1 px-6 py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 transition-colors shadow-lg"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Submit Feedback
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FeedbackModal;
