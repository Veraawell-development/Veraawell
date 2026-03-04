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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl scale-in-center">
                {/* Header */}
                <div className="bg-teal-600 text-white p-8 rounded-t-3xl text-center relative">
                    <h2 className="text-3xl font-bold font-serif">Session Feedback</h2>
                    <p className="text-teal-50 opacity-90 mt-2">Your feedback helps us improve Veerawell</p>
                </div>

                <div className="p-8 space-y-10">
                    {/* Section 1: Doctor Rating */}
                    <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center font-bold">1</div>
                            <h3 className="text-lg font-bold text-gray-800">Rate {doctorName} <span className="text-red-500 font-normal text-sm ml-1">(Mandatory)</span></h3>
                        </div>

                        <StarRating
                            score={doctorScore}
                            setScore={setDoctorScore}
                            hoverScore={doctorHoveredScore}
                            setHoverScore={setDoctorHoveredScore}
                            label="How was your session today?"
                        />

                        <div className="mt-6">
                            <textarea
                                value={doctorFeedback}
                                onChange={(e) => setDoctorFeedback(e.target.value)}
                                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all resize-none text-sm"
                                rows={3}
                                placeholder="Any comments or suggestions for the doctor? (Optional)"
                            />
                        </div>
                    </div>

                    {/* Section 2: Platform Rating */}
                    <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold">2</div>
                            <h3 className="text-lg font-bold text-gray-800">Rate the Platform <span className="text-gray-400 font-normal text-sm ml-1">(Optional)</span></h3>
                        </div>

                        <StarRating
                            score={platformScore}
                            setScore={setPlatformScore}
                            hoverScore={platformHoveredScore}
                            setHoverScore={setPlatformHoveredScore}
                            label="How was your experience with Veerawell?"
                        />

                        <div className="mt-6">
                            <textarea
                                value={platformFeedback}
                                onChange={(e) => setPlatformFeedback(e.target.value)}
                                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none text-sm"
                                rows={3}
                                placeholder="Tell us how we can make our app better... (Optional)"
                            />
                        </div>
                    </div>

                    {/* Error Display */}
                    {error && (
                        <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-medium border border-red-100 animate-shake">
                            {error}
                        </div>
                    )}

                    {/* Footer Actions */}
                    <div className="flex flex-col gap-4">
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || doctorScore === 0}
                            className="w-full py-4 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl font-bold shadow-lg shadow-teal-600/20 transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:grayscale"
                        >
                            {isSubmitting ? 'Submitting...' : 'Submit All Feedback'}
                        </button>

                        {!isSubmitting && (
                            <button
                                onClick={onClose}
                                className="text-gray-400 text-sm hover:text-gray-600 transition-colors"
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
