import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface MoodCheckInModalProps {
  isOpen: boolean;
  firstName?: string;
  onClose: () => void;
  onSubmit: (mood: number) => Promise<void> | void;
}

const MOODS = [
  { value: 1, label: 'Struggling', color: '#E8956D' },
  { value: 2, label: 'Low', color: '#C4A882' },
  { value: 3, label: 'Okay', color: '#9BB5BC' },
  { value: 4, label: 'Good', color: '#6BA888' },
  { value: 5, label: 'Great', color: '#0097B2' },
];

const MoodCheckInModal: React.FC<MoodCheckInModalProps> = ({ isOpen, firstName, onClose, onSubmit }) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      setSelected(null);
      setHovered(null);
      setSubmitting(false);
      setSaved(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(onClose, 200);
  };

  const handleSelect = async (value: number) => {
    if (submitting) return;
    setSelected(value);
    setSubmitting(true);
    try {
      await onSubmit(value);
      setSaved(true);
      setTimeout(() => {
        setIsAnimating(false);
        setTimeout(onClose, 300);
      }, 900);
    } catch {
      setSubmitting(false);
      setSelected(null);
    }
  };

  const previewValue = hovered ?? selected;
  const preview = MOODS.find((m) => m.value === previewValue);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 transition-all duration-300 ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
      style={{
        backgroundColor: 'rgba(10, 30, 34, 0.35)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
      }}
      onClick={handleClose}
    >
      <div
        className={`relative w-full max-w-md overflow-hidden rounded-[28px] transition-all duration-300 ${isAnimating ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {/* Close */}
        <button
          type="button"
          aria-label="Close"
          onClick={handleClose}
          className="absolute top-5 right-5 z-10 transition-colors hover:opacity-70"
          style={{ color: 'var(--text-3)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="px-8 pt-9 pb-8">
          <span
            className="text-xs font-bold tracking-widest uppercase block mb-3"
            style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}
          >
            — Daily Check-In
          </span>

          <AnimatePresence mode="wait">
            {saved ? (
              <motion.div
                key="saved"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <h2
                  className="leading-[1.2] mb-2"
                  style={{ fontFamily: 'var(--font-display)', fontSize: '32px', color: 'var(--text)' }}
                >
                  Thank you for sharing.
                </h2>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
                  We've noted how you're feeling today.
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="prompt"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <h2
                  className="leading-[1.2] mb-2"
                  style={{ fontFamily: 'var(--font-display)', fontSize: '32px', color: 'var(--text)' }}
                >
                  How are you feeling{firstName ? `, ${firstName}` : ''}?
                </h2>
                <p className="text-sm leading-relaxed mb-8" style={{ color: 'var(--text-2)' }}>
                  Take a moment to check in with yourself. This stays private between you and your care team.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {!saved && (
            <>
              {/* Mood scale */}
              <div
                className="flex items-center justify-between rounded-2xl px-4 py-5 mb-3"
                style={{ background: 'var(--bg-2)' }}
              >
                {MOODS.map((m) => {
                  const isSelected = selected === m.value;
                  return (
                    <motion.button
                      key={m.value}
                      type="button"
                      disabled={submitting}
                      onClick={() => handleSelect(m.value)}
                      onMouseEnter={() => setHovered(m.value)}
                      onMouseLeave={() => setHovered(null)}
                      aria-label={m.label}
                      className="relative flex flex-col items-center justify-center"
                      style={{ width: 40, height: 40 }}
                      whileHover={!submitting ? { scale: 1.2 } : undefined}
                      whileTap={!submitting ? { scale: 0.88 } : undefined}
                      animate={{
                        scale: isSelected ? 1.25 : 1,
                        opacity: submitting && !isSelected ? 0.3 : 1,
                      }}
                      transition={{ type: 'spring', stiffness: 420, damping: 18 }}
                    >
                      {/* Pulse ring on selection */}
                      <AnimatePresence>
                        {isSelected && (
                          <motion.span
                            key="ring"
                            className="absolute rounded-full"
                            style={{ background: m.color, width: 22, height: 22 }}
                            initial={{ opacity: 0.45, scale: 1 }}
                            animate={{ opacity: 0, scale: 2.4 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.7, ease: 'easeOut' }}
                          />
                        )}
                      </AnimatePresence>

                      <span
                        className="rounded-full"
                        style={{ width: 22, height: 22, background: m.color }}
                      />
                    </motion.button>
                  );
                })}
              </div>

              {/* Hover / selected label */}
              <div className="h-6 flex items-center justify-end mb-2">
                <AnimatePresence mode="wait">
                  {preview && (
                    <motion.span
                      key={preview.value}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="text-xs font-bold tracking-widest uppercase"
                      style={{ color: preview.color, fontFamily: 'var(--font-mono)' }}
                    >
                      {submitting ? 'Saving…' : preview.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MoodCheckInModal;
