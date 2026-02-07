import { useState, useEffect } from 'react';
import OTPInput from './OTPInput';
import { API_BASE_URL } from '../config/api';
import toast from 'react-hot-toast';

interface OTPVerificationModalProps {
    isOpen: boolean;
    email: string;
    userType: 'patient' | 'doctor';
    onVerified: () => void;
    onClose: () => void;
}

export default function OTPVerificationModal({
    isOpen,
    email,
    onVerified,
    onClose
}: OTPVerificationModalProps) {
    const [otp, setOtp] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const [error, setError] = useState('');
    const [countdown, setCountdown] = useState(60);
    const [canResend, setCanResend] = useState(false);
    const [isResending, setIsResending] = useState(false);

    // Countdown timer for resend button
    useEffect(() => {
        if (!isOpen) return;

        setCountdown(60);
        setCanResend(false);

        const timer = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    setCanResend(true);
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isOpen]);

    // Auto-verify when 6 digits entered
    useEffect(() => {
        if (otp.length === 6) {
            handleVerify();
        }
    }, [otp]);

    const handleVerify = async () => {
        if (otp.length !== 6) {
            setError('Please enter complete 6-digit code');
            return;
        }

        setIsVerifying(true);
        setError('');

        try {
            const response = await fetch(`${API_BASE_URL}/otp/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, otp }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                toast.success('Email verified successfully!');
                onVerified();
            } else {
                setError(data.message || 'Invalid OTP. Please try again.');
                setOtp(''); // Clear OTP on error
            }
        } catch (error) {
            console.error('OTP verification error:', error);
            setError('Failed to verify OTP. Please try again.');
            setOtp('');
        } finally {
            setIsVerifying(false);
        }
    };

    const handleResend = async () => {
        setIsResending(true);
        setError('');

        try {
            const response = await fetch(`${API_BASE_URL}/otp/resend`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                toast.success('OTP resent to your email');
                setOtp('');
                setCountdown(60);
                setCanResend(false);

                // Restart countdown
                const timer = setInterval(() => {
                    setCountdown((prev) => {
                        if (prev <= 1) {
                            setCanResend(true);
                            clearInterval(timer);
                            return 0;
                        }
                        return prev - 1;
                    });
                }, 1000);
            } else {
                toast.error(data.message || 'Failed to resend OTP');
            }
        } catch (error) {
            console.error('OTP resend error:', error);
            toast.error('Failed to resend OTP. Please try again.');
        } finally {
            setIsResending(false);
        }
    };

    const maskEmail = (email: string) => {
        const [name, domain] = email.split('@');
        if (name.length <= 2) return email;
        return `${name[0]}${'*'.repeat(name.length - 2)}${name[name.length - 1]}@${domain}`;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 sm:p-8 relative animate-fadeIn">
                {/* Close button - only show when not verifying */}
                {!isVerifying && (
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                        aria-label="Close"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}

                {/* Header */}
                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-teal-400 to-teal-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">Verify Your Email</h2>
                    <p className="text-gray-600 text-sm">
                        We sent a 6-digit code to
                    </p>
                    <p className="text-teal-600 font-semibold mt-1">{maskEmail(email)}</p>
                </div>

                {/* OTP Input */}
                <div className="mb-6">
                    <OTPInput
                        value={otp}
                        onChange={setOtp}
                        disabled={isVerifying}
                        error={!!error}
                    />
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-red-600 text-sm text-center">{error}</p>
                    </div>
                )}

                {/* Verifying State */}
                {isVerifying && (
                    <div className="mb-4 p-3 bg-teal-50 border border-teal-200 rounded-lg">
                        <p className="text-teal-700 text-sm text-center flex items-center justify-center gap-2">
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Verifying...
                        </p>
                    </div>
                )}

                {/* Resend Button */}
                <div className="text-center">
                    <p className="text-gray-600 text-sm mb-2">Didn't receive the code?</p>
                    {canResend ? (
                        <button
                            onClick={handleResend}
                            disabled={isResending}
                            className="text-teal-600 font-semibold hover:text-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isResending ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Resending...
                                </span>
                            ) : (
                                <>Resend Code</>
                            )}
                        </button>
                    ) : (
                        <p className="text-gray-400 text-sm">
                            Resend in <span className="font-semibold">{countdown}s</span>
                        </p>
                    )}
                </div>

                {/* Info */}
                <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-blue-700 text-xs text-center">
                        💡 Check your spam folder if you don't see the email
                    </p>
                </div>
            </div>
        </div>
    );
}
