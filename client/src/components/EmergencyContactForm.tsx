import React from 'react';
import { formatIndianPhone, normaliseIndianPhone } from '../utils/phone';
import { RELATIONSHIP_OPTIONS } from '../utils/emergencyContact';
import type { EmergencyContactErrors, EmergencyContactValue } from '../utils/emergencyContact';

interface EmergencyContactFormProps {
  value: EmergencyContactValue;
  onChange: (value: EmergencyContactValue) => void;
  errors?: EmergencyContactErrors;
  disabled?: boolean;
  /** Prefix for the input ids, so two forms on one page don't share ids. */
  idPrefix?: string;
  /** Two columns from `sm` up (the profile page) or one column (modals). */
  layout?: 'grid' | 'stack';
  inputClassName?: string;
  labelClassName?: string;
}

const DEFAULT_INPUT = 'w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all bg-gray-50/50 focus:bg-white disabled:opacity-50';
const DEFAULT_LABEL = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2';

/**
 * The emergency-contact fields — name, phone, relationship — shared by the
 * profile page, the prompt before joining from the dashboard, and the call
 * room, so all three accept the same things and say the same things. The
 * phone takes a number however it's typed or pasted ("+91 98765 43210",
 * "098765 43210") and is tidied to "+91 98765 43210" when the field is left.
 */
const EmergencyContactForm: React.FC<EmergencyContactFormProps> = ({
  value,
  onChange,
  errors = {},
  disabled = false,
  idPrefix = 'ec',
  layout = 'stack',
  inputClassName = DEFAULT_INPUT,
  labelClassName = DEFAULT_LABEL,
}) => {
  const set = (field: keyof EmergencyContactValue) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => onChange({ ...value, [field]: e.target.value });

  const tidyPhone = () => {
    if (normaliseIndianPhone(value.phone)) onChange({ ...value, phone: formatIndianPhone(value.phone) });
  };

  const error = (field: keyof EmergencyContactValue) =>
    errors[field] ? (
      <p id={`${idPrefix}-${field}-error`} className="text-red-600 text-xs mt-1.5" role="alert">
        {errors[field]}
      </p>
    ) : null;

  const describedBy = (field: keyof EmergencyContactValue) => (errors[field] ? `${idPrefix}-${field}-error` : undefined);

  return (
    <div className={layout === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6' : 'space-y-4'}>
      <div>
        <label htmlFor={`${idPrefix}-name`} className={labelClassName}>Name</label>
        <input
          id={`${idPrefix}-name`}
          type="text"
          autoComplete="off"
          maxLength={80}
          value={value.name}
          onChange={set('name')}
          disabled={disabled}
          aria-invalid={!!errors.name}
          aria-describedby={describedBy('name')}
          className={inputClassName}
          placeholder="e.g. Asha Sharma"
        />
        {error('name')}
      </div>
      <div>
        <label htmlFor={`${idPrefix}-phone`} className={labelClassName}>Phone</label>
        <input
          id={`${idPrefix}-phone`}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          maxLength={20}
          value={value.phone}
          onChange={set('phone')}
          onBlur={tidyPhone}
          disabled={disabled}
          aria-invalid={!!errors.phone}
          aria-describedby={describedBy('phone')}
          className={inputClassName}
          placeholder="+91 98765 43210"
        />
        {error('phone')}
      </div>
      <div>
        <label htmlFor={`${idPrefix}-relationship`} className={labelClassName}>Relationship</label>
        <select
          id={`${idPrefix}-relationship`}
          value={value.relationship}
          onChange={set('relationship')}
          disabled={disabled}
          aria-invalid={!!errors.relationship}
          aria-describedby={describedBy('relationship')}
          className={inputClassName}
        >
          <option value="">Select relationship</option>
          {/* Keep an older saved value that isn't in today's list selectable. */}
          {value.relationship && !RELATIONSHIP_OPTIONS.includes(value.relationship) && (
            <option value={value.relationship}>{value.relationship}</option>
          )}
          {RELATIONSHIP_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        {error('relationship')}
      </div>
    </div>
  );
};

export default EmergencyContactForm;
