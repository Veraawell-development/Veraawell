import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPhone, FiHeart } from 'react-icons/fi';
import { URGENT_HELPLINES } from '../data/helplines';
import type { CrisisReason } from '../utils/crisisSupport';

const FONT = { fontFamily: 'Inter, sans-serif' };

/**
 * Crisis help on a test result: the two urgent numbers as tap-to-call links
 * and a way to a therapist. Shown above the score, so it is the first thing
 * read, never below a fold.
 */
const CrisisSupportCard: React.FC<{ reason: Exclude<CrisisReason, null> }> = ({ reason }) => {
    const navigate = useNavigate();
    const selfHarm = reason === 'self-harm';

    return (
        <section
            role="alert"
            aria-labelledby="crisis-title"
            className="rounded-[20px] border p-6 md:p-7 mb-8"
            style={{ background: '#FFF7F7', borderColor: '#FECACA' }}
        >
            <h2 id="crisis-title" className="text-[18px] font-bold text-gray-900 mb-1.5" style={FONT}>
                {selfHarm
                    ? "If you're thinking about harming yourself, please talk to someone now"
                    : "You don't have to handle this alone"}
            </h2>
            <p className="text-[14px] text-gray-600 leading-relaxed mb-5" style={FONT}>
                {selfHarm
                    ? 'You mentioned thoughts of harming yourself or being better off dead. Free, confidential help is available right now, any time of day.'
                    : 'Your answers suggest you are going through a lot right now. Talking to someone can help — free support is available any time.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
                {URGENT_HELPLINES.map((h) => (
                    <a
                        key={h.tel}
                        href={`tel:${h.tel}`}
                        className="flex-1 flex items-center gap-3 rounded-[14px] bg-white border border-red-100 px-4 py-3 hover:border-red-200 transition-colors"
                        style={FONT}
                    >
                        <FiPhone className="w-5 h-5 text-red-600 shrink-0" aria-hidden="true" />
                        <span className="flex flex-col">
                            <span className="text-[16px] font-bold text-gray-900">Call {h.number}</span>
                            <span className="text-[12px] text-gray-500">{h.name}</span>
                        </span>
                    </a>
                ))}
                <button
                    type="button"
                    onClick={() => navigate('/choose-professional')}
                    className="flex-1 flex items-center justify-center gap-2 rounded-[14px] bg-teal-600 hover:bg-teal-700 text-white px-4 py-3 text-[14px] font-semibold transition-colors"
                    style={FONT}
                >
                    <FiHeart className="w-4 h-4" aria-hidden="true" />
                    Book a therapist
                </button>
            </div>
        </section>
    );
};

export default CrisisSupportCard;
