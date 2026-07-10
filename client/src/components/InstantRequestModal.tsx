import React, { useState, useEffect, useRef } from 'react';
import { FiVideo, FiClock, FiArrowRight } from 'react-icons/fi';
import type { Session } from '../types';

interface InstantRequestModalProps {
    session: Session;
    isOpen: boolean;
    onAccept: (sessionId: string) => void;
    onDelay: (sessionId: string, minutes: number, note: string) => void;
    onMissed: (sessionId: string) => void;
    onClose: () => void;
}

const InstantRequestModal: React.FC<InstantRequestModalProps> = ({ session, isOpen, onAccept, onDelay, onMissed }) => {
    const [showDelayOptions, setShowDelayOptions] = useState(false);
    const [delayMinutes, setDelayMinutes] = useState(5);
    const [isCustomDelay, setIsCustomDelay] = useState(false);
    const [note, setNote] = useState('');
    const [timeLeft, setTimeLeft] = useState(60);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        let timer: ReturnType<typeof setInterval>;
        if (isOpen) {
            setTimeLeft(60);
            timer = setInterval(() => {
                setTimeLeft((prev) => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        onMissed(session._id);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            try {
                const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/1359/1359-preview.mp3');
                audio.loop = true;
                const playAudio = async () => {
                    try {
                        await audio.play();
                    } catch (e) {
                        console.log('Audio play failed:', e);
                    }
                };
                playAudio();
                audioRef.current = audio;
            } catch (err) {
                console.log('Audio initialization failed');
            }
        } else {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
            if (showDelayOptions) {
                setShowDelayOptions(false);
                setDelayMinutes(5);
                setIsCustomDelay(false);
                setNote('');
                return;
            }
        }
        return () => {
            if (timer) clearInterval(timer);
            if (audioRef.current) {
                audioRef.current.pause();
            }
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-gray-500/20 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in">
            <div className="bg-white rounded-[24px] w-full max-w-[340px] shadow-2xl overflow-hidden transform transition-all duration-300 animate-in zoom-in-95 relative border border-gray-100">
                
                <div className="p-7">
                    {/* Animated Pulsing Icon Area */}
                    <div className="flex justify-center mb-6 relative">
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-16 h-16 bg-teal-50 rounded-full animate-ping opacity-60"></div>
                        </div>
                        <div className="relative w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center border-4 border-white shadow-sm">
                            <FiVideo className="w-5 h-5 text-teal-600" />
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-gray-100 rounded-full h-1.5 mb-4 overflow-hidden">
                        <div 
                            className="bg-teal-500 h-1.5 rounded-full transition-all duration-1000 ease-linear"
                            style={{ width: `${(timeLeft / 60) * 100}%` }}
                        ></div>
                    </div>
                    <div className="text-center text-[11px] text-gray-400 font-medium mb-4 uppercase tracking-widest" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Time remaining: {timeLeft}s
                    </div>

                    <div className="text-center mb-6">
                        <h2 className="text-[18px] font-bold text-gray-800 tracking-tight mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Incoming Request
                        </h2>
                        <p className="text-[13px] text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
                            <span className="font-semibold text-gray-700">{session.patientId?.firstName} {session.patientId?.lastName}</span> is waiting for a session.
                        </p>
                    </div>

                    {!showDelayOptions ? (
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => onAccept(session._id)}
                                className="w-full bg-teal-500 hover:bg-teal-600 text-white font-bold py-2.5 rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 text-[14px]"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                            >
                                <span>Accept & Join</span>
                            </button>

                            <button
                                onClick={() => setShowDelayOptions(true)}
                                className="w-full bg-transparent hover:bg-gray-50 text-gray-500 hover:text-gray-700 font-medium py-2 rounded-xl transition-colors flex items-center justify-center gap-1.5 text-[13px]"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                            >
                                <FiClock className="w-3.5 h-3.5" />
                                <span>Delay session</span>
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4 animate-in slide-in-from-right-2 duration-300">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 text-left" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    Delay by
                                </label>
                                <div className="grid grid-cols-4 gap-2">
                                    {[5, 10, 15, 'Custom'].map(option => {
                                        const isActive = option === 'Custom' ? isCustomDelay : (!isCustomDelay && delayMinutes === option);
                                        return (
                                            <button
                                                key={option}
                                                onClick={() => {
                                                    if (option === 'Custom') {
                                                        setIsCustomDelay(true);
                                                    } else {
                                                        setIsCustomDelay(false);
                                                        setDelayMinutes(option as number);
                                                    }
                                                }}
                                                className={`py-1.5 rounded-lg text-[13px] font-semibold transition-colors ${isActive ? 'bg-teal-50 text-teal-700 border border-teal-100' : 'bg-gray-50 text-gray-500 hover:bg-gray-100 border border-transparent'
                                                    }`}
                                                style={{ fontFamily: 'Inter, sans-serif' }}
                                            >
                                                {option === 'Custom' ? 'Custom' : `${option}m`}
                                            </button>
                                        );
                                    })}
                                </div>
                                {isCustomDelay && (
                                    <input
                                        type="number"
                                        min="1"
                                        max="60"
                                        value={delayMinutes}
                                        onChange={(e) => setDelayMinutes(parseInt(e.target.value) || 1)}
                                        placeholder="Minutes"
                                        className="mt-2 w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/20 transition-all"
                                    />
                                )}
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 text-left" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    Note (Optional)
                                </label>
                                <select
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-[13px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/20 transition-all cursor-pointer"
                                    style={{ fontFamily: 'Inter, sans-serif' }}
                                >
                                    <option value="">No reason</option>
                                    <option value="I'm finishing a previous call">Finishing previous call</option>
                                    <option value="I need a quick 5-minute break">Need a quick break</option>
                                    <option value="Just preparing for your session">Preparing notes</option>
                                </select>
                            </div>

                            <div className="flex gap-2 mt-1">
                                <button
                                    onClick={() => setShowDelayOptions(false)}
                                    className="px-3 py-2 rounded-lg bg-transparent hover:bg-gray-50 text-gray-500 font-medium transition-colors text-[13px]"
                                    style={{ fontFamily: 'Inter, sans-serif' }}
                                >
                                    Back
                                </button>
                                <button
                                    onClick={() => onDelay(session._id, delayMinutes, note)}
                                    className="flex-1 bg-teal-500 hover:bg-teal-600 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-[13px]"
                                    style={{ fontFamily: 'Inter, sans-serif' }}
                                >
                                    <span>Send & Delay</span>
                                    <FiArrowRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default InstantRequestModal;
