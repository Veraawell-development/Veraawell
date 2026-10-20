import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import { useMutation } from '@tanstack/react-query';
import { getAuthToken } from '../utils/authToken';
import { useDialog } from '../hooks/useDialog';

interface RatingModalProps {
    isOpen: boolean;
    sessionId: string;
    doctorName: string;
    onClose: () => void;
    onSubmit?: (rating: { score: number; review: string }) => void;
    /** For "Book a follow-up" in the wrap-up after the feedback is sent. */
    doctorId?: string;
}

const RatingModal: React.FC<RatingModalProps> = ({
    isOpen,
    sessionId,
    doctorName,
    onClose,
    onSubmit,
    doctorId
}) => {
    const navigate = useNavigate();
    // After sending: what happens next, instead of just closing.
    const [done, setDone] = useState(false);
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
    // The therapist rating is saved before the optional platform one. If only
    // the second fails, a retry must not send the first again — the server
    // refuses it as a duplicate, so the patient could never get past the error.
    const [doctorSaved, setDoctorSaved] = useState(false);
    const dialog = useDialog(isOpen, onClose, done ? 'done' : 'form');
    // A fresh form for each session (the dashboard reuses one modal).
    useEffect(() => {
        setDone(false); setDoctorSaved(false); setError('');
        setDoctorScore(0); setDoctorFeedback(''); setPlatformScore(0); setPlatformFeedback('');
    }, [sessionId]);

    // Every hook before the early return: useMutation used to sit after it,
    // so opening the form inside an already-mounted modal (Rate Session in
    // the session details) changed the hook count and crashed the page.
    const submitReviewMutation = useMutation({
        mutationFn: async (payload: any) => {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            const token = getAuthToken();
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const res = await fetch(`${API_BASE_URL}/reviews/submit`, {
                method: 'POST',
                headers,
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw Object.assign(new Error(data.message || 'Failed to submit review'), { status: res.status });
            }
            return res.json();
        }
    });

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!sessionId) {
            setError('Invalid session. Please refresh and try again.');
            return;
        }

        if (doctorScore === 0 && !doctorSaved) {
            setError(`Please provide a rating for ${doctorName}`);
            return;
        }

        setIsSubmitting(true);
        setError('');
        let saved = doctorSaved;

        try {
            // 1. Submit Doctor Review (Mandatory). A star-only rating sends no
            //    comment — it used to send filler text that then appeared on
            //    the therapist's profile as a quote.
            if (!doctorSaved) {
                try {
                    await submitReviewMutation.mutateAsync({
                        sessionId,
                        rating: doctorScore,
                        feedback: doctorFeedback.trim(),
                        reviewType: 'doctor'
                    });
                } catch (err: any) {
                    // Already rated (another tab, an earlier attempt): it is saved.
                    if (!(err?.status === 400 && /already submitted/i.test(err.message || ''))) throw err;
                }
                saved = true;
                setDoctorSaved(true);
                // The session is rated from here on, whatever happens next.
                if (onSubmit) onSubmit({ score: doctorScore, review: doctorFeedback.trim() });
            }

            // 2. Submit Platform Review (Optional)
            if (platformScore > 0) {
                await submitReviewMutation.mutateAsync({
                    sessionId,
                    rating: platformScore,
                    feedback: platformFeedback.trim(),
                    reviewType: 'platform'
                });
            }

            setDone(true);
        } catch (err: any) {
            setError(saved
                ? `Your rating of ${doctorName} is saved. The Veraawell rating didn't go through — try again, or skip it.`
                : err.message || 'Failed to submit feedback');
        } finally {
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
            <div className="flex justify-center gap-2 sm:gap-3" role="group" aria-label={label}>
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        type="button"
                        aria-label={`${star} star${star > 1 ? 's' : ''}`}
                        aria-pressed={score === star}
                        onClick={() => setScore(star)}
                        onMouseEnter={() => setHoverScore(star)}
                        onMouseLeave={() => setHoverScore(0)}
                        className="transition-all transform hover:scale-110 focus:outline-none"
                        disabled={isSubmitting}
                    >
                        <svg 
                            aria-hidden="true"
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-3 sm:p-4 font-sans" onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}>
            <div
                ref={dialog.ref}
                role="dialog"
                aria-modal="true"
                aria-labelledby="rating-modal-title"
                tabIndex={-1}
                className="bg-white rounded-2xl max-w-xl w-full max-h-[90dvh] overflow-y-auto shadow-2xl relative outline-none"
            >
                {/* Close Button - Top Right */}
                <button
                    onClick={onClose}
                    aria-label="Close feedback"
                    className="absolute top-4 right-4 sm:top-6 sm:right-6 w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 text-2xl transition-colors z-10"
                    style={{ lineHeight: 1 }}
                >
                    <span aria-hidden="true">×</span>
                </button>

                {done ? (
                    <div className="p-8 text-center" role="status">
                        <h2 id="rating-modal-title" className="text-2xl font-light tracking-tight text-gray-900">Thank you</h2>
                        <p className="text-gray-500 mt-2 text-sm">Here's what happens next.</p>
                        <ul className="mt-6 space-y-3 text-left text-sm text-gray-700">
                            <li className="flex gap-3"><span aria-hidden="true" className="text-teal-600">1</span><span>{doctorName} will share your session report and any recommendations — you'll find them under Reports.</span></li>
                            <li className="flex gap-3"><span aria-hidden="true" className="text-teal-600">2</span><span>Tasks they set for you appear in Pending tasks.</span></li>
                            <li className="flex gap-3"><span aria-hidden="true" className="text-teal-600">3</span><span>Writing a few lines in your journal while it's fresh can help.</span></li>
                        </ul>
                        <div className="mt-8 flex flex-col gap-3">
                            {doctorId && (
                                <button onClick={() => { onClose(); navigate(`/doctor/${doctorId}`); }} className="w-full py-3.5 rounded-full text-white text-sm font-medium" style={{ backgroundColor: '#111827' }}>
                                    Book a follow-up with {doctorName}
                                </button>
                            )}
                            <div className="flex gap-3">
                                <button onClick={() => { onClose(); navigate('/pending-tasks'); }} className="flex-1 py-3 rounded-full border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">Pending tasks</button>
                                <button onClick={() => { onClose(); navigate('/my-journal'); }} className="flex-1 py-3 rounded-full border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">Journal</button>
                            </div>
                            <button onClick={onClose} className="w-full py-2 text-gray-400 font-medium hover:text-gray-800 text-xs tracking-wide uppercase">Done</button>
                        </div>
                    </div>
                ) : (<>

                {/* Header */}
                <div className="p-8 pb-4 text-center relative">
                    <h2 id="rating-modal-title" className="text-2xl font-light tracking-tight text-gray-900">Session Feedback</h2>
                    <p className="text-gray-400 mt-2 text-sm font-medium">Your feedback helps us improve Veraawell</p>
                </div>

                <div className="p-5 sm:p-8 space-y-10">
                    {/* Section 1: Doctor Rating (hidden once saved — only the platform part is left) */}
                    <div className="relative" hidden={doctorSaved}>
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
                                maxLength={2000}
                                aria-label={`Comment for ${doctorName} (optional)`}
                                placeholder="Any comments or suggestions for the doctor? (Optional)"
                            />
                            <p className="mt-2 text-xs text-gray-500">
                                Your rating and comment are shown publicly on {doctorName}'s profile as “Verified patient” — never your name.
                            </p>
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
                            label="How was your experience with Veraawell?"
                        />

                        <div className="mt-8">
                            <textarea
                                value={platformFeedback}
                                onChange={(e) => setPlatformFeedback(e.target.value)}
                                className="w-full bg-transparent border-0 border-b border-gray-200 text-gray-800 placeholder-gray-400 focus:border-teal-500 focus:ring-0 outline-none px-0 py-2 transition-all resize-none text-sm"
                                rows={2}
                                maxLength={2000}
                                aria-label="Comment about Veraawell (optional)"
                                placeholder="Tell us how we can make our app better... (Optional)"
                            />
                        </div>
                    </div>

                    {/* Error Display */}
                    {error && (
                        <div role="alert" className="bg-red-50 text-red-600 p-4 rounded-lg text-xs font-medium border border-red-100">
                            {error}
                            {doctorSaved && (
                                <button type="button" onClick={() => setDone(true)} className="ml-2 underline font-semibold">Skip it</button>
                            )}
                        </div>
                    )}

                    {/* Footer Actions */}
                    <div className="flex flex-col gap-4 pt-4 pb-2">
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || (doctorScore === 0 && !doctorSaved)}
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
                </>)}
            </div>
        </div>
    );
};

export default RatingModal;
