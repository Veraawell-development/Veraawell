import React, { useEffect, useId, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useAdmin } from '../../context/AdminContext';
import { ADMIN_MIN_PASSWORD_LENGTH, errorMessage } from '../../utils/adminApi';
import { CancelButton, Modal, ModalButton } from './AdminUI';

const inputClass =
  'w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-800 focus:outline-none focus:border-[#0097b2] focus:ring-1 focus:ring-[#0097b2] disabled:opacity-50';

/**
 * Change the signed-in admin's password. `forced` is the first-login case
 * (an account created with a temporary password): it can't be dismissed, and
 * signing out is the only other way off the screen.
 */
const ChangePasswordModal: React.FC<{ open: boolean; onClose: () => void; forced?: boolean }> = ({ open, onClose, forced = false }) => {
  const { changePassword, logout } = useAdmin();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const ids = { current: useId(), next: useId(), confirm: useId() };

  useEffect(() => {
    if (open) { setCurrent(''); setNext(''); setConfirm(''); setError(''); }
  }, [open]);

  const submit = async () => {
    setError('');
    if (!current) return setError('Enter your current password.');
    if (next.length < ADMIN_MIN_PASSWORD_LENGTH) return setError(`The new password must be at least ${ADMIN_MIN_PASSWORD_LENGTH} characters.`);
    if (next !== confirm) return setError("The new passwords don't match.");
    if (next === current) return setError('Choose a password different from your current one.');
    setSaving(true);
    try {
      await changePassword(current, next);
      toast.success('Password changed');
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Couldn't change your password. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={forced ? 'Set a new password to continue' : 'Change password'}
      onClose={forced ? () => {} : onClose}
      busy={saving}
      footer={(
        <>
          {forced
            ? <button type="button" onClick={() => { void logout(); }} disabled={saving} className="text-xs font-semibold text-neutral-500 px-3 py-2 disabled:opacity-50">Sign out</button>
            : <CancelButton onClick={onClose} disabled={saving} />}
          <ModalButton onClick={() => { void submit(); }} busy={saving}>Change password</ModalButton>
        </>
      )}
    >
      {forced && (
        <p className="mb-4 text-neutral-500">
          This account was set up with a temporary password. Choose your own before using the console.
        </p>
      )}
      <form
        className="space-y-3"
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
      >
        <div>
          <label htmlFor={ids.current} className="block text-[11px] font-semibold text-neutral-600 mb-1">Current password</label>
          <input id={ids.current} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} disabled={saving} className={inputClass} />
        </div>
        <div>
          <label htmlFor={ids.next} className="block text-[11px] font-semibold text-neutral-600 mb-1">New password</label>
          <input id={ids.next} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} disabled={saving} className={inputClass} />
          <p className="text-[10px] text-neutral-400 mt-1">At least {ADMIN_MIN_PASSWORD_LENGTH} characters.</p>
        </div>
        <div>
          <label htmlFor={ids.confirm} className="block text-[11px] font-semibold text-neutral-600 mb-1">Confirm new password</label>
          <input id={ids.confirm} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={saving} className={inputClass} />
        </div>
        {error && <p role="alert" className="text-[11px] font-medium text-red-600">{error}</p>}
        {/* Enter submits. */}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
};

export default ChangePasswordModal;
