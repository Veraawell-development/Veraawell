import React, { useState } from 'react';
import { X } from 'lucide-react';

interface ReviewSubmissionModalProps {
    isOpen: boolean;
    onClose: () => void;
    sessionId: string;
    doctorName: string;
    onSubmitSuccess: () => void;
}

const ReviewSubmissionModal: React.FC<ReviewSubmissionModalProps> = ({
    isOpen,
    onClose,
    sessionId,
    doctorName,
    onSubmitSuccess
}) => {
    const [rating, setRating] = useState<number>(0);
    const [hoveredStar, setHoveredStar] = useState<number>(0);
    const [feedback, setFeedback] = useState('');
    const [reviewType, setReviewType] = useState<'doctor' | 'platform'>('doctor');
    const [positives, setPositives] = useState('');
    const [improvements, setImprovements] = useState('');
    const [wouldRecommend, setWouldRecommend] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const API_BASE_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:5001/api'
        : 'https://veraawell-backend.onrender.com/api';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (rating === 0) {
            setError('Please select a rating');
            return;
        }

        if (!feedback.trim()) {
            setError('Please provide your feedback');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/reviews/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    sessionId,
                    rating,
                    feedback,
                    positives,
                    improvements,
                    wouldRecommend,
                    reviewType
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to submit review');
            }

            onSubmitSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to submit review');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-gradient-to-r from-[#7DA9A8] to-[#6B9998] text-white p-6 rounded-t-2xl flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold">Share Your Experience</h2>
                        <p className="text-sm opacity-90 mt-1">Your feedback helps us improve</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-white hover:bg-white/20 rounded-full p-2 transition-all"
                    >
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Rating */}
                    <div>
                        <label className="block text-gray-700 font-semibold mb-3">
                            How would you rate your experience?
                        </label>
                        <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    type="button"
                                    onClick={() => setRating(star)}
                                    onMouseEnter={() => setHoveredStar(star)}
                                    onMouseLeave={() => setHoveredStar(0)}
                                    className="transition-transform hover:scale-110 focus:outline-none"
                                >
                                    <span
                                        className={`text-5xl ${star <= (hoveredStar || rating)
                                                ? 'text-[#FFB800]'
                                                : 'text-gray-300'
                                            }`}
                                    >
                                        ★
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Review Type */}
                    <div>
                        <label className="block text-gray-700 font-semibold mb-3">
                            This review is for:
                        </label>
                        <div className="space-y-2">
                            <label className="flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all hover:bg-gray-50"
                                style={{
                                    borderColor: reviewType === 'doctor' ? '#7DA9A8' : '#E5E7EB',
                                    backgroundColor: reviewType === 'doctor' ? '#F0F9F9' : 'white'
                                }}
                            >
                                <input
                                    type="radio"
                                    name="reviewType"
                                    value="doctor"
                                    checked={reviewType === 'doctor'}
                                    onChange={(e) => setReviewType(e.target.value as 'doctor')}
                                    className="w-5 h-5 text-[#7DA9A8] focus:ring-[#7DA9A8]"
                                />
                                <div className="ml-3">
                                    <span className="font-medium text-gray-900">Dr. {doctorName}</span>
                                    <p className="text-sm text-gray-600">Will appear on doctor's profile</p>
                                </div>
                            </label>

                            <label className="flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all hover:bg-gray-50"
                                style={{
                                    borderColor: reviewType === 'platform' ? '#7DA9A8' : '#E5E7EB',
                                    backgroundColor: reviewType === 'platform' ? '#F0F9F9' : 'white'
                                }}
                            >
                                <input
                                    type="radio"
                                    name="reviewType"
                                    value="platform"
                                    checked={reviewType === 'platform'}
                                    onChange={(e) => setReviewType(e.target.value as 'platform')}
                                    className="w-5 h-5 text-[#7DA9A8] focus:ring-[#7DA9A8]"
                                />
                                <div className="ml-3">
                                    <span className="font-medium text-gray-900">Veraawell Platform</span>
                                    <p className="text-sm text-gray-600">Will appear on homepage</p>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Feedback */}
                    <div>
                        <label htmlFor="feedback" className="block text-gray-700 font-semibold mb-2">
                            Your Feedback <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            id="feedback"
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#7DA9A8] focus:ring-2 focus:ring-[#7DA9A8]/20 transition-all resize-none"
                            rows={4}
                            placeholder="Share your thoughts about your experience..."
                            required
                        />
                    </div>

                    {/* Optional fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="positives" className="block text-gray-700 font-medium mb-2 text-sm">
                                What went well? (Optional)
                            </label>
                            <textarea
                                id="positives"
                                value={positives}
                                onChange={(e) => setPositives(e.target.value)}
                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#7DA9A8] focus:ring-2 focus:ring-[#7DA9A8]/20 transition-all resize-none"
                                rows={3}
                                placeholder="What did you appreciate?"
                            />
                        </div>

                        <div>
                            <label htmlFor="improvements" className="block text-gray-700 font-medium mb-2 text-sm">
                                Areas for improvement (Optional)
                            </label>
                            <textarea
                                id="improvements"
                                value={improvements}
                                onChange={(e) => setImprovements(e.target.value)}
                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#7DA9A8] focus:ring-2 focus:ring-[#7DA9A8]/20 transition-all resize-none"
                                rows={3}
                                placeholder="Any suggestions?"
                            />
                        </div>
                    </div>

                    {/* Would Recommend */}
                    <div className="flex items-center">
                        <input
                            type="checkbox"
                            id="wouldRecommend"
                            checked={wouldRecommend}
                            onChange={(e) => setWouldRecommend(e.target.checked)}
                            className="w-5 h-5 text-[#7DA9A8] focus:ring-[#7DA9A8] rounded"
                        />
                        <label htmlFor="wouldRecommend" className="ml-3 text-gray-700 font-medium">
                            I would recommend this to others
                        </label>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl">
                            {error}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 px-6 py-3 bg-gradient-to-r from-[#7DA9A8] to-[#6B9998] text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? 'Submitting...' : 'Submit Review'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ReviewSubmissionModal;
