import React, { useState, useEffect, useRef } from 'react';
import type { Session } from '../types';

interface InstantRequestModalProps {
    session: Session;
    isOpen: boolean;
    onAccept: (sessionId: string) => void;
    onDelay: (sessionId: string, minutes: number, note: string) => void;
    onClose: () => void;
}

const InstantRequestModal: React.FC<InstantRequestModalProps> = ({ session, isOpen, onAccept, onDelay }) => {
    const [showDelayOptions, setShowDelayOptions] = useState(false);
    const [delayMinutes, setDelayMinutes] = useState(5);
    const [note, setNote] = useState('');
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        if (isOpen) {
            // Play a gentle ringing sound
            try {
                const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/1359/1359-preview.mp3');
                audio.loop = true;
                audio.play().catch(e => console.log('Audio play failed:', e));
                audioRef.current = audio;
            } catch (err) {
                console.log('Audio initialization failed');
            }
        } else {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        }
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
            }
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl transform transition-all animate-in zoom-in-95 duration-300">
                {/* Header - Gradient with Pulse */}
                <div className="bg-gradient-to-r from-teal-500 to-emerald-500 p-6 text-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                    <div className="relative z-10">
                        <div className="w-20 h-20 bg-white/20 rounded-full mx-auto flex items-center justify-center mb-3">
                            <svg className="w-10 h-10 text-white animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-white font-serif">Instant Session</h2>
                        <p className="text-teal-50 text-sm opacity-90">Someone needs your help now</p>
                    </div>
                </div>

                {/* Content */}
                <div className="p-8 text-center bg-white">
                    <div className="mb-6">
                        <h3 className="text-xl font-bold text-gray-800 mb-1">
                            {session.patientId?.firstName} {session.patientId?.lastName}
                        </h3>
                        <p className="text-gray-500 text-sm">Requested an immediate session</p>
                    </div>

                    {!showDelayOptions ? (
                        <div className="flex flex-col space-y-3">
                            <button
                                onClick={() => onAccept(session._id)}
                                className="w-full bg-teal-500 hover:bg-teal-600 text-white font-bold py-4 rounded-2xl shadow-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center space-x-2"
                            >
                                <span>Accept & Join Now</span>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                                </svg>
                            </button>

                            <button
                                onClick={() => setShowDelayOptions(true)}
                                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 rounded-2xl transition-all"
                            >
                                Delay by few mins
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
                            <div className="flex justify-between items-center bg-gray-50 p-1 rounded-xl">
                                {[5, 10, 15].map(mins => (
                                    <button
                                        key={mins}
                                        onClick={() => setDelayMinutes(mins)}
                                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${delayMinutes === mins ? 'bg-white text-teal-600 shadow-sm' : 'text-gray-400'
                                            }`}
                                    >
                                        {mins}m
                                    </button>
                                ))}
                            </div>

                            <select
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                className="w-full bg-gray-50 border-0 rounded-xl px-4 py-3 text-sm text-gray-600 focus:ring-2 focus:ring-teal-500/20"
                            >
                                <option value="">Reason (Optional)</option>
                                <option value="I'm finishing a previous call">Finishing previous call</option>
                                <option value="I need a quick 5-minute break">Need a quick break</option>
                                <option value="Just preparing for your session">Preparing notes</option>
                                <option value="Connecting my headphones">Connecting audio</option>
                            </select>

                            <div className="flex space-x-2">
                                <button
                                    onClick={() => setShowDelayOptions(false)}
                                    className="flex-1 bg-gray-100 text-gray-500 font-bold py-3 rounded-xl hover:bg-gray-200 transition-all"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={() => onDelay(session._id, delayMinutes, note)}
                                    className="flex-[2] bg-teal-500 text-white font-bold py-3 rounded-xl hover:bg-teal-600 shadow-md transition-all"
                                >
                                    Confirm Delay
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
