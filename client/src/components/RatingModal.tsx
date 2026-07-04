import React, { useState } from 'react';
import { API_BASE_URL } from '../config/api';

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
            <p className="text-gray-500 font-medium mb-4 text-sm tracking-wide">{label}</p>
            <div className="flex justify-center gap-3">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        type="button"
                        onClick={() => setScore(star)}
                        onMouseEnter={() => setHoverScore(star)}
                        onMouseLeave={() => setHoverScore(0)}
                        className="transition-all transform hover:scale-110 focus:outline-none"
                        disabled={isSubmitting}
                    >
                        <svg 
                            className={`w-10 h-10 transition-colors duration-200 ${star <= (hoverScore || score) ? 'text-yellow-400 drop-shadow-md' : 'text-gray-200'}`} 
                            fill="currentColor" 
                            viewBox="0 0 24 24"
                        >
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
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
                    
                </button>

                {/* Header */}
                <div className="p-8 pb-4 text-center relative">
                    <h2 className="text-2xl font-light tracking-tight text-gray-900">Session Feedback</h2>
                    <p className="text-gray-400 mt-2 text-sm font-medium">Your feedback helps us improve Veerawell</p>
                </div>

                <div className="p-8 space-y-10">
                    {/* Section 1: Doctor Rating */}
                    <div className="relative">
                        <div className="flex items-center justify-center gap-2 mb-6">
                            <span className="text-xs font-bold tracking-widest text-teal-600 uppercase">Rate {doctorName}</span>
                            <span className="text-[10px] text-red-400 tracking-wider uppercase bg-red-50 px-2 py-0.5 rounded-full">Required</span>
                        </div>

                        <StarRating
                            score={doctorScore}
                            setScore={setDoctorScore}
                            hoverScore={doctorHoveredScore}
                            setHoverScore={setDoctorHoveredScore}
                            label="How was your session today?"
                        />

                        <div className="mt-8">
                            <textarea
                                value={doctorFeedback}
                                onChange={(e) => setDoctorFeedback(e.target.value)}
                                className="w-full bg-transparent border-0 border-b border-gray-200 text-gray-800 placeholder-gray-400 focus:border-teal-500 focus:ring-0 outline-none px-0 py-2 transition-all resize-none text-sm"
                                rows={2}
                                placeholder="Any comments or suggestions for the doctor? (Optional)"
                            />
                        </div>
                    </div>

                    <div className="h-px w-full bg-gray-100" />

                    {/* Section 2: Platform Rating */}
                    <div className="relative">
                        <div className="flex items-center justify-center gap-2 mb-6">
                            <span className="text-xs font-bold tracking-widest text-gray-600 uppercase">Rate the Platform</span>
                            <span className="text-[10px] text-gray-400 tracking-wider uppercase bg-gray-100 px-2 py-0.5 rounded-full">Optional</span>
                        </div>

                        <StarRating
                            score={platformScore}
                            setScore={setPlatformScore}
                            hoverScore={platformHoveredScore}
                            setHoverScore={setPlatformHoveredScore}
                            label="How was your experience with Veerawell?"
                        />

                        <div className="mt-8">
                            <textarea
                                value={platformFeedback}
                                onChange={(e) => setPlatformFeedback(e.target.value)}
                                className="w-full bg-transparent border-0 border-b border-gray-200 text-gray-800 placeholder-gray-400 focus:border-teal-500 focus:ring-0 outline-none px-0 py-2 transition-all resize-none text-sm"
                                rows={2}
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
                    <div className="flex flex-col gap-4 pt-4 pb-2">
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || doctorScore === 0}
                            className="w-full py-4 text-white rounded-full font-medium transition-all transform active:scale-[0.99] text-sm tracking-wide disabled:opacity-50"
                            style={{ 
                                backgroundColor: '#111827',
                                cursor: doctorScore === 0 ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
                        </button>

                        {!isSubmitting && (
                            <button
                                onClick={onClose}
                                className="w-full py-2 text-gray-400 font-medium transition-colors hover:text-gray-800 text-xs tracking-wide uppercase"
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
