import { useRef, useEffect, type KeyboardEvent, type ClipboardEvent } from 'react';

interface OTPInputProps {
    value: string;
    onChange: (otp: string) => void;
    disabled?: boolean;
    error?: boolean;
}

export default function OTPInput({ value, onChange, disabled = false, error = false }: OTPInputProps) {
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
    const digits = value.split('').concat(Array(6).fill('')).slice(0, 6);

    useEffect(() => {
        // Auto-focus first input on mount
        if (inputRefs.current[0] && !disabled) {
            inputRefs.current[0].focus();
        }
    }, [disabled]);

    const handleChange = (index: number, digit: string) => {
        if (disabled) return;

        // Only allow single digit
        const sanitized = digit.replace(/[^0-9]/g, '').slice(0, 1);

        const newDigits = [...digits];
        newDigits[index] = sanitized;
        const newValue = newDigits.join('').slice(0, 6);

        onChange(newValue);

        // Auto-focus next input if digit entered
        if (sanitized && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }
    };

    const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
        if (disabled) return;

        // Handle backspace
        if (e.key === 'Backspace' && !digits[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }

        // Handle left arrow
        if (e.key === 'ArrowLeft' && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }

        // Handle right arrow
        if (e.key === 'ArrowRight' && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }
    };

    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
        if (disabled) return;

        e.preventDefault();
        const pastedData = e.clipboardData.getData('text/plain');
        const sanitized = pastedData.replace(/[^0-9]/g, '').slice(0, 6);

        if (sanitized) {
            onChange(sanitized);
            // Focus last filled input or first empty one
            const focusIndex = Math.min(sanitized.length, 5);
            inputRefs.current[focusIndex]?.focus();
        }
    };

    return (
        <div className="flex gap-2 sm:gap-3 justify-center">
            {digits.map((digit, index) => (
                <input
                    key={index}
                    ref={(el) => { inputRefs.current[index] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={handlePaste}
                    disabled={disabled}
                    className={`
            w-10 h-12 sm:w-12 sm:h-14 md:w-14 md:h-16
            text-center text-2xl sm:text-3xl font-bold
            border-2 rounded-lg
            transition-all duration-200
            ${error
                            ? 'border-red-500 text-red-600 bg-red-50'
                            : 'border-gray-300 text-gray-800 bg-white'
                        }
            ${!disabled && !error
                            ? 'focus:border-teal-500 focus:ring-2 focus:ring-teal-200 focus:outline-none hover:border-teal-400'
                            : ''
                        }
            ${disabled ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''}
          `}
                    aria-label={`OTP digit ${index + 1}`}
                />
            ))}
        </div>
    );
}
