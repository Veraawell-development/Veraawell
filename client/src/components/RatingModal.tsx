import React, { useState } from 'react';

interface RatingModalProps {
    isOpen: boolean;
    sessionId: string;
    doctorName: string;
    onClose: () => void;
    onSubmit?: (rating: { score: number; review: string }) => void;
}

const RatingModal: React.FC<RatingModalProps> = ({
    isOpen,
    sessionId,
    doctorName,
    onClose,
    onSubmit
}) => {
    // Part 1: Doctor Rating (Mandatory)
    const [doctorScore, setDoctorScore] = useState<number>(0);
    const [doctorHoveredScore, setDoctorHoveredScore] = useState<number>(0);
    const [doctorFeedback, setDoctorFeedback] = useState('');

    // Part 2: Platform Rating (Optional)
    const [platformScore, setPlatformScore] = useState<number>(0);
    const [platformHoveredScore, setPlatformHoveredScore] = useState<number>(0);
    const [platformFeedback, setPlatformFeedback] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const API_BASE_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:5001/api'
        : 'https://veraawell-backend.onrender.com/api';

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!sessionId) {
            setError('Invalid session. Please refresh and try again.');
            return;
        }

        if (doctorScore === 0) {
            setError(`Please provide a rating for ${doctorName}`);
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            // 1. Submit Doctor Review (Mandatory)
            const doctorPayload = {
                sessionId,
                rating: doctorScore,
                feedback: doctorFeedback || 'No additional comments provided.',
                reviewType: 'doctor'
            };

            const doctorRes = await fetch(`${API_BASE_URL}/reviews/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(doctorPayload)
            });

            if (!doctorRes.ok) {
                const data = await doctorRes.json();
                throw new Error(data.message || 'Failed to submit doctor review');
            }

            // 2. Submit Platform Review (Optional)
            if (platformScore > 0) {
                const platformPayload = {
                    sessionId,
                    rating: platformScore,
                    feedback: platformFeedback || 'No additional comments provided.',
                    reviewType: 'platform'
                };

                await fetch(`${API_BASE_URL}/reviews/submit`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(platformPayload)
                });
            }

            if (onSubmit) {
                onSubmit({ score: doctorScore, review: doctorFeedback });
            }

            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to submit feedback');
            setIsSubmitting(false);
        }
    };

    const StarRating = ({
        score,
        setScore,
        hoverScore,
        setHoverScore,
        label
    }: {
        score: number,
        setScore: (s: number) => void,
        hoverScore: number,
        setHoverScore: (s: number) => void,
        label: string
    }) => (
        <div className="text-center">
            <p className="text-gray-700 font-medium mb-3">{label}</p>
            <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        type="button"
                        onClick={() => setScore(star)}
                        onMouseEnter={() => setHoverScore(star)}
                        onMouseLeave={() => setHoverScore(0)}
                        className="transition-transform hover:scale-110 focus:outline-none"
                        disabled={isSubmitting}
                    >
                        <span className={`text-4xl ${star <= (hoverScore || score) ? 'text-[#FFB800]' : 'text-gray-200'}`}>
                            ★
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4 font-sans">
            <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative">
                {/* Close Button - Top Right */}
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 text-2xl transition-colors z-10"
                    style={{ lineHeight: 1 }}
                >
                    ✕
                </button>

                {/* Header */}
                <div className="p-8 pb-0 text-center relative">
                    <h2 className="text-2xl font-bold text-gray-800">Session Feedback</h2>
                    <p className="text-gray-500 mt-1 text-sm">Your feedback helps us improve Veerawell</p>
                </div>

                <div className="p-8 space-y-6">
                    {/* Section 1: Doctor Rating */}
                    <div className="bg-[#F9FAFB] p-5 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 text-white rounded-full flex items-center justify-center font-bold text-sm" style={{ backgroundColor: '#7DA9A8' }}>1</div>
                            <h3 className="text-base font-bold text-gray-800">Rate {doctorName} <span className="text-red-500 font-normal text-xs ml-1">(Mandatory)</span></h3>
                        </div>

                        <StarRating
                            score={doctorScore}
                            setScore={setDoctorScore}
                            hoverScore={doctorHoveredScore}
                            setHoverScore={setDoctorHoveredScore}
                            label="How was your session today?"
                        />

                        <div className="mt-4">
                            <textarea
                                value={doctorFeedback}
                                onChange={(e) => setDoctorFeedback(e.target.value)}
                                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all resize-none text-sm"
                                rows={3}
                                placeholder="Any comments or suggestions for the doctor? (Optional)"
                            />
                        </div>
                    </div>

                    {/* Section 2: Platform Rating */}
                    <div className="bg-[#F9FAFB] p-5 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 text-white rounded-full flex items-center justify-center font-bold text-sm" style={{ backgroundColor: '#7DA9A8' }}>2</div>
                            <h3 className="text-base font-bold text-gray-800">Rate the Platform <span className="text-gray-400 font-normal text-xs ml-1">(Optional)</span></h3>
                        </div>

                        <StarRating
                            score={platformScore}
                            setScore={setPlatformScore}
                            hoverScore={platformHoveredScore}
                            setHoverScore={setPlatformHoveredScore}
                            label="How was your experience with Veerawell?"
                        />

                        <div className="mt-4">
                            <textarea
                                value={platformFeedback}
                                onChange={(e) => setPlatformFeedback(e.target.value)}
                                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none text-sm"
                                rows={3}
                                placeholder="Tell us how we can make our app better... (Optional)"
                            />
                        </div>
                    </div>

                    {/* Error Display */}
                    {error && (
                        <div className="bg-red-50 text-red-600 p-4 rounded-lg text-xs font-medium border border-red-100">
                            {error}
                        </div>
                    )}

                    {/* Footer Actions */}
                    <div className="flex flex-col gap-3 pt-2">
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || doctorScore === 0}
                            className="w-full py-3.5 text-white rounded-full font-semibold transition-all transform active:scale-[0.98] text-sm shadow-md hover:shadow-lg disabled:shadow-none"
                            style={{ 
                                background: doctorScore === 0 
                                    ? '#F3F4F6' 
                                    : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                                color: doctorScore === 0 ? '#9CA3AF' : '#FFFFFF',
                                cursor: doctorScore === 0 ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {isSubmitting ? 'Submitting...' : 'Submit All Feedback'}
                        </button>

                        {!isSubmitting && (
                            <button
                                onClick={onClose}
                                className="w-full py-3 text-gray-600 border border-gray-200 rounded-full font-semibold transition-all hover:bg-gray-50 hover:text-gray-800 text-sm"
                            >
                                Do this later
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RatingModal;
