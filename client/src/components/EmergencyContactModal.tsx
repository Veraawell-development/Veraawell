import React, { useEffect, useRef, useState } from 'react';
import { IoClose } from 'react-icons/io5';
import { FiShield } from 'react-icons/fi';
import EmergencyContactForm from './EmergencyContactForm';
import { useSaveEmergencyContact } from '../hooks/useEmergencyContact';
import { checkEmergencyContact, EMPTY_CONTACT } from '../utils/emergencyContact';
import type { EmergencyContactErrors, EmergencyContactValue } from '../utils/emergencyContact';

interface EmergencyContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called once the contact is saved and the signed-in user refreshed. */
  onSaved?: (contact: EmergencyContactValue) => void;
  /**
   * Older callers: called after the save, with the saved (normalised) values.
   * The modal saves the contact itself now, so a caller doesn't have to.
   */
  onSubmit?: (contactName: string, contactPhone: string, contactRelationship: string) => void | Promise<void>;
  title?: string;
  description?: string;
  submitLabel?: string;
  /** The secondary button's label, e.g. "Back to dashboard" in the call room. */
  closeLabel?: string;
}

/**
 * Asks for the emergency contact before a session — from the dashboard's Join
 * and from the call room — and saves it. It used to hand the fields back
 * unsaved: a failed save was silent, the fields were wiped before anyone
 * knew whether it worked, and nothing refreshed the signed-in user, so the
 * call room asked again a moment later.
 */
const EmergencyContactModal: React.FC<EmergencyContactModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  onSubmit,
  title = 'Emergency contact',
  description = 'Just in case we ever need to reach someone on your behalf — this only takes a moment.',
  submitLabel = 'Save and continue',
  closeLabel = 'Cancel',
}) => {
  const save = useSaveEmergencyContact();
  const [value, setValue] = useState<EmergencyContactValue>(EMPTY_CONTACT);
  const [errors, setErrors] = useState<EmergencyContactErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Read through refs so a parent re-rendering with a new onClose doesn't
  // re-run the effect (and pull focus back to the first field mid-typing).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const savingRef = useRef(saving);
  savingRef.current = saving;

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !savingRef.current) closeRef.current(); };
    window.addEventListener('keydown', onKey);
    dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    const checked = checkEmergencyContact(value, { required: true });
    if (!checked.ok) { setErrors(checked.errors); return; }
    if (checked.clear) return; // unreachable with required: true
    setErrors({});
    setSaving(true);
    try {
      const saved = (await save(checked.contact)) || checked.contact;
      setValue(EMPTY_CONTACT);
      onSaved?.(saved);
      if (onSubmit) await onSubmit(saved.name, saved.phone, saved.relationship);
    } catch (err) {
      setSaveError((err as Error).message || "Couldn't save your emergency contact. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[300]" onClick={() => !saving && onClose()} />

      <div className="fixed inset-0 z-[301] flex items-center justify-center p-4 pointer-events-none">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="emergency-contact-title"
          className="bg-white rounded-3xl shadow-2xl w-full max-w-md pointer-events-auto overflow-y-auto max-h-[92vh] font-sans"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative px-7 pt-7 pb-6" style={{ background: 'linear-gradient(135deg, #F2FAF9 0%, #FFFFFF 70%)' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close"
            >
              <IoClose size={22} />
            </button>
            <div className="w-11 h-11 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(56,171,174,0.12)' }}>
              <FiShield className="w-5 h-5" style={{ color: '#38ABAE' }} />
            </div>
            <h2 id="emergency-contact-title" className="text-[22px] font-bold text-gray-800 tracking-tight pr-8">
              {title}
            </h2>
            <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{description}</p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="px-7 pb-7 pt-1">
            <EmergencyContactForm value={value} onChange={setValue} errors={errors} disabled={saving} idPrefix="ec-modal" />

            <div className="mt-5 mb-6 p-3.5 rounded-xl border border-teal-100" style={{ background: 'rgba(56,171,174,0.06)' }}>
              <p className="text-xs text-gray-600 leading-relaxed">
                <strong className="text-gray-700">Why we ask:</strong> This contact is only reached in a mental health emergency, or if your therapist believes you need immediate support.
              </p>
            </div>

            {saveError && (
              <p className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm" role="alert">{saveError}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="flex-1 px-6 py-3 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-all disabled:opacity-50"
              >
                {closeLabel}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-6 py-3 text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-sm disabled:opacity-60"
                style={{ backgroundColor: '#38ABAE' }}
              >
                {saving ? 'Saving…' : submitLabel}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default EmergencyContactModal;
