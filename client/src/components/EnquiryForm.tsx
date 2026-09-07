import React, { useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { useSubmitEnquiry, EnquiryError, type EnquiryType } from '../hooks/useEnquiry';

/**
 * The single-step enquiry form behind the careers page's "Partner with us" and
 * "Other Queries" tabs.
 *
 * Field classes are copied verbatim from the professional application form in
 * CareerPage so all three tabs read as one page. Deliberately *not* the 3-step
 * wizard — these are five fields, and a progress bar over five fields is
 * theatre.
 *
 * It owns its own error/success state rather than sharing CareerPage's,
 * because `setActiveTab` there resets `currentStep` but not `error`/`success`,
 * so shared state would leak the professional form's messages into this one.
 */

const LABEL = 'block text-sm font-medium text-[var(--text-2)] mb-2';
const FIELD = 'w-full px-4 py-3 rounded-xl border border-[var(--border)] focus:ring-2 focus:ring-[var(--teal)] focus:border-transparent outline-none transition-all bg-[var(--bg)]';

interface EnquiryFormProps {
  type: Extract<EnquiryType, 'partner' | 'other'>;
}

const EnquiryForm: React.FC<EnquiryFormProps> = ({ type }) => {
  const isPartner = type === 'partner';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const submitEnquiry = useSubmitEnquiry();

  /**
   * Validated here rather than left to the server. The professional form on
   * this page has no per-step validation at all — Next just increments the
   * step — so client-side checks are a new pattern here, added deliberately:
   * a round trip to be told a required field is blank is a poor trade.
   */
  const validate = () => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Please tell us your name';
    if (!email.trim()) errors.email = 'We need an email to reply to';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'That email address looks incomplete';
    if (isPartner && !organisation.trim()) errors.organisation = 'Which organisation are you writing from?';
    if (!isPartner && !subject.trim()) errors.subject = 'A short subject helps us route your query';
    if (!message.trim()) errors.message = 'Please add a short message';
    else if (message.trim().length > 4000) errors.message = 'Please keep this under 4000 characters';
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      await submitEnquiry.mutateAsync({
        type,
        name: name.trim(),
        email: email.trim(),
        message: message.trim(),
        ...(isPartner
          ? { organisation: organisation.trim(), phone: phone.trim() || undefined }
          : { subject: subject.trim() }),
      });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof EnquiryError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors as Record<string, string>);
      } else {
        setError('We could not send that just now. Please try again in a moment.');
      }
    }
  };

  if (submitted) {
    return (
      <div className="text-center py-16 animate-in fade-in max-w-md mx-auto">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ background: 'var(--teal-muted)', color: 'var(--teal)' }}>
          <CheckCircle2 size={24} />
        </div>
        <h3 className="text-[20px] font-bold mb-3" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
          Thank you — we have it
        </h3>
        <p className="text-[var(--text-2)] mb-6">
          {isPartner
            ? 'Our partnerships team will read this and get back to you within two working days.'
            : 'Someone from the team will reply to you within two working days.'}
        </p>
        <button
          type="button"
          onClick={() => {
            setSubmitted(false);
            setName(''); setEmail(''); setPhone(''); setOrganisation(''); setSubject(''); setMessage('');
            setFieldErrors({});
          }}
          className="text-[var(--teal)] hover:underline font-medium text-sm"
        >
          Send another enquiry
        </button>
      </div>
    );
  }

  const fieldError = (key: string) => (
    fieldErrors[key]
      ? <p className="text-red-600 text-xs mt-1.5">{fieldErrors[key]}</p>
      : null
  );

  return (
    <div className="animate-in fade-in max-w-2xl mx-auto">
      <p className="text-center text-[var(--text-2)] mb-8">
        {isPartner
          ? 'Tell us about your clinic or organisation and we will get back to you personally.'
          : 'Press, hiring questions, or anything else — send it here and we will route it to the right person.'}
      </p>

      {error && (
        <div className="mb-6 p-4 bg-red-50/50 border border-red-200/50 rounded-2xl">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className={LABEL} htmlFor={`enquiry-${type}-name`}>Your Name *</label>
            <input
              id={`enquiry-${type}-name`}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={FIELD}
              placeholder="Priya Sharma"
              maxLength={120}
            />
            {fieldError('name')}
          </div>
          <div>
            <label className={LABEL} htmlFor={`enquiry-${type}-email`}>Email *</label>
            <input
              id={`enquiry-${type}-email`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={FIELD}
              placeholder="priya@example.com"
              maxLength={200}
            />
            {fieldError('email')}
          </div>
        </div>

        {isPartner ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className={LABEL} htmlFor="enquiry-partner-organisation">Organisation *</label>
              <input
                id="enquiry-partner-organisation"
                type="text"
                value={organisation}
                onChange={(e) => setOrganisation(e.target.value)}
                className={FIELD}
                placeholder="Sunrise Wellness Clinic"
                maxLength={160}
              />
              {fieldError('organisation')}
            </div>
            <div>
              <label className={LABEL} htmlFor="enquiry-partner-phone">Phone</label>
              <input
                id="enquiry-partner-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={FIELD}
                placeholder="+91 98765 43210"
                maxLength={32}
              />
              {fieldError('phone')}
            </div>
          </div>
        ) : (
          <div>
            <label className={LABEL} htmlFor="enquiry-other-subject">Subject *</label>
            <input
              id="enquiry-other-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={FIELD}
              placeholder="Press enquiry"
              maxLength={200}
            />
            {fieldError('subject')}
          </div>
        )}

        <div>
          <label className={LABEL} htmlFor={`enquiry-${type}-message`}>
            {isPartner ? 'How would you like to work together? *' : 'Your Message *'}
          </label>
          <textarea
            id={`enquiry-${type}-message`}
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className={`${FIELD} resize-none`}
            placeholder={isPartner
              ? 'We run a 12-bed clinic in Pune and would like to offer sessions to our patients…'
              : 'Tell us what you need…'}
            maxLength={4000}
          />
          {fieldError('message')}
        </div>

        <div className="flex flex-col items-center gap-4 pt-2">
          <button
            type="submit"
            disabled={submitEnquiry.isPending}
            className="px-8 py-3 rounded-full bg-[var(--teal)] text-white font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {submitEnquiry.isPending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Sending…
              </>
            ) : (
              isPartner ? 'Send Partnership Enquiry' : 'Send Enquiry'
            )}
          </button>
          <p className="text-center text-sm text-[var(--text-3)]">
            Prefer email? Write to{' '}
            <a href="mailto:contact@veraawell.com" className="text-[var(--teal)] hover:underline font-medium">
              contact@veraawell.com
            </a>
          </p>
        </div>
      </form>
    </div>
  );
};

export default EnquiryForm;
