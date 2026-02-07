import React, { useState } from 'react';

interface RatingModalProps {
    isOpen: boolean;
    sessionId: string;
    doctorName: string;
    onClose: () => void;
    onSubmit: (rating: { score: number; review: string }) => void;
}

const RatingModal: React.FC<RatingModalProps> = ({
    isOpen,
    sessionId,
    doctorName,
    onClose,
    onSubmit
}) => {
    const [score, setScore] = useState<number>(0);
    const [hoveredScore, setHoveredScore] = useState<number>(0);
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

    if (!isOpen) return null;

    const handleSubmit = async () => {
        // Validate sessionId first
        if (!sessionId || sessionId.trim() === '') {
            setError('Invalid session. Please refresh and try again.');
            console.error('[RATING] No valid session ID available:', { sessionId });
            return;
        }

        if (score === 0) {
            setError('Please select a rating');
            return;
        }

        if (!feedback.trim()) {
            setError('Please provide your feedback');
            return;
        }

        setIsSubmitting(true);
        setError('');

        // Debug logging
        const payload = {
            sessionId,
            rating: score,
            feedback,
            positives,
            improvements,
            wouldRecommend,
            reviewType
        };

        console.log('[RATING] Submitting review with payload:', {
            ...payload,
            feedback: feedback.substring(0, 50) + '...',
            sessionIdLength: sessionId.length,
            sessionIdType: typeof sessionId
        });

        try {
            const response = await fetch(`${API_BASE_URL}/reviews/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include', // Use cookies instead of Authorization header
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            console.log('[RATING] Response received:', {
                status: response.status,
                ok: response.ok,
                data
            });

            if (!response.ok) {
                throw new Error(data.message || 'Failed to submit review');
            }

            // Also call original onSubmit for backward compatibility
            await onSubmit({ score, review: feedback });

            // Reset state
            setScore(0);
            setHoveredScore(0);
            setFeedback('');
            setPositives('');
            setImprovements('');
            setError('');
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to submit review');
            setIsSubmitting(false);
        }
    };

    // Prevent closing modal by clicking outside (mandatory rating)
    const handleBackdropClick = (e: React.MouseEvent) => {
        e.stopPropagation();
    };

    return (
        <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={handleBackdropClick}
        >
            <div
                className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-[#7DA9A8] to-[#6B9998] text-white p-6 rounded-t-2xl">
                    <h2 className="text-2xl font-bold">Rate Your Session</h2>
                    <p className="text-sm opacity-90 mt-1">with {doctorName}</p>
                </div>

                <div className="p-6 space-y-6">
                    {/* Star Rating */}
                    <div>
                        <label className="block text-gray-700 font-semibold mb-3">
                            How would you rate your experience?
                        </label>
                        <div className="flex justify-center gap-2">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    type="button"
                                    onClick={() => setScore(star)}
                                    onMouseEnter={() => setHoveredScore(star)}
                                    onMouseLeave={() => setHoveredScore(0)}
                                    className="transition-transform hover:scale-110 focus:outline-none"
                                    disabled={isSubmitting}
                                >
                                    <span
                                        className={`text-5xl ${star <= (hoveredScore || score)
                                            ? 'text-[#FFB800]'
                                            : 'text-gray-300'
                                            }`}
                                    >
                                        ★
                                    </span>
                                </button>
                            ))}
                        </div>
                        {score > 0 && (
                            <p className="text-center text-lg font-semibold text-gray-700 mt-3">
                                {score === 5 && 'Excellent!'}
                                {score === 4 && 'Very Good'}
                                {score === 3 && 'Good'}
                                {score === 2 && 'Fair'}
                                {score === 1 && 'Needs Improvement'}
                            </p>
                        )}
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
                                    <span className="font-medium text-gray-900">{doctorName}</span>
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

                    {/* Submit Button */}
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting || score === 0}
                        className="w-full px-6 py-4 bg-gradient-to-r from-[#7DA9A8] to-[#6B9998] text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Submitting...
                            </span>
                        ) : (
                            'Submit Review'
                        )}
                    </button>

                    {/* Helper text */}
                    {score === 0 && (
                        <p className="text-center text-xs text-gray-500">
                            Please select a rating and provide feedback to continue
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RatingModal;
