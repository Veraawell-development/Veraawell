import React, { useEffect, useId, useState } from 'react';
import { FiAlertTriangle, FiChevronLeft, FiChevronRight, FiRefreshCw } from 'react-icons/fi';
import { errorMessage } from '../../utils/adminApi';

/**
 * Building blocks shared by the admin console's tabs: in-app modals (the
 * console used window.prompt/confirm/alert, which a browser may suppress and
 * which can't show what is being confirmed), an error state with Retry, and
 * a pager.
 */

export const Spinner: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5 border-2 border-white' }) => (
  <span className={`inline-block ${className} border-t-transparent rounded-full animate-spin`} aria-hidden="true" />
);

export const LoadingBlock: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div className="p-12 flex flex-col items-center justify-center gap-3" role="status">
    <Spinner className="w-7 h-7 border-[3px] border-[#0097b2]" />
    <p className="text-xs font-medium text-neutral-400">{label}</p>
  </div>
);

export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; hint?: string }> = ({ icon, title, hint }) => (
  <div className="p-12 text-center">
    {icon && <div className="text-neutral-300 flex justify-center mb-3">{icon}</div>}
    <p className="text-sm font-medium text-neutral-500">{title}</p>
    {hint && <p className="text-xs text-neutral-400 mt-1">{hint}</p>}
  </div>
);

/**
 * A query that failed says so. These screens used to fall through to their
 * empty state — "No pending doctor requests", "₹0" — which reads as a fact
 * about the platform when it is really a failed request.
 */
export const QueryErrorState: React.FC<{
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
  title?: string;
}> = ({ error, onRetry, retrying = false, title = "Couldn't load this" }) => (
  <div className="p-10 text-center" role="alert">
    <FiAlertTriangle size={24} className="mx-auto text-amber-500 mb-3" />
    <p className="text-sm font-semibold text-neutral-800">{title}</p>
    <p className="text-xs text-neutral-500 mt-1 max-w-md mx-auto">{errorMessage(error)}</p>
    <button
      type="button"
      onClick={onRetry}
      disabled={retrying}
      className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-[#0097b2] hover:bg-[#007c93] text-white disabled:opacity-50"
    >
      {retrying ? <Spinner /> : <FiRefreshCw size={13} />}
      Retry
    </button>
  </div>
);

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden ${className}`}>{children}</div>
);

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  /** While true the modal can't be dismissed — the request is in flight. */
  busy?: boolean;
  children: React.ReactNode;
  footer: React.ReactNode;
  wide?: boolean;
}

export const Modal: React.FC<ModalProps> = ({ open, title, onClose, busy = false, children, footer, wide = false }) => {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-white p-6 rounded-2xl border border-neutral-100 shadow-lg w-full ${wide ? 'max-w-lg' : 'max-w-sm'} max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="text-sm font-semibold text-neutral-900 mb-2">{title}</h3>
        <div className="text-xs text-neutral-600">{children}</div>
        <div className="flex items-center justify-end gap-2 mt-5">{footer}</div>
      </div>
    </div>
  );
};

const TONE: Record<'primary' | 'danger' | 'success', string> = {
  primary: 'bg-[#0097b2] hover:bg-[#007c93]',
  danger: 'bg-red-600 hover:bg-red-700',
  success: 'bg-emerald-600 hover:bg-emerald-700',
};

export const ModalButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: keyof typeof TONE;
  children: React.ReactNode;
}> = ({ onClick, disabled = false, busy = false, tone = 'primary', children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled || busy}
    className={`flex items-center gap-1.5 text-xs font-semibold text-white px-4 py-2 rounded-lg disabled:opacity-50 ${TONE[tone]}`}
  >
    {busy && <Spinner />}
    {children}
  </button>
);

export const CancelButton: React.FC<{ onClick: () => void; disabled?: boolean }> = ({ onClick, disabled }) => (
  <button type="button" onClick={onClick} disabled={disabled} className="text-xs font-semibold text-neutral-500 px-3 py-2 disabled:opacity-50">
    Cancel
  </button>
);

export const ConfirmModal: React.FC<{
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  tone?: keyof typeof TONE;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  wide?: boolean;
}> = ({ open, title, children, confirmLabel, tone = 'primary', busy = false, onConfirm, onClose, wide }) => (
  <Modal
    open={open}
    title={title}
    onClose={onClose}
    busy={busy}
    wide={wide}
    footer={(
      <>
        <CancelButton onClick={onClose} disabled={busy} />
        <ModalButton onClick={onConfirm} busy={busy} tone={tone}>{confirmLabel}</ModalButton>
      </>
    )}
  >
    {children}
  </Modal>
);

/** Asks for a reason (a rejection, a flag) before acting. The reason is required. */
export const ReasonModal: React.FC<{
  open: boolean;
  title: string;
  description?: React.ReactNode;
  label: string;
  placeholder?: string;
  confirmLabel: string;
  busy?: boolean;
  onSubmit: (reason: string) => void;
  onClose: () => void;
}> = ({ open, title, description, label, placeholder, confirmLabel, busy = false, onSubmit, onClose }) => {
  const [reason, setReason] = useState('');
  const fieldId = useId();

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <CancelButton onClick={onClose} disabled={busy} />
          <ModalButton onClick={() => onSubmit(reason.trim())} busy={busy} disabled={!reason.trim()} tone="danger">
            {confirmLabel}
          </ModalButton>
        </>
      )}
    >
      {description && <div className="mb-4 text-neutral-500">{description}</div>}
      <label htmlFor={fieldId} className="block text-xs font-semibold text-neutral-700 mb-1.5">{label}</label>
      <textarea
        id={fieldId}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={placeholder}
        disabled={busy}
        className="w-full p-3 text-xs bg-neutral-50 rounded-lg border border-neutral-200 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 min-h-[80px]"
      />
    </Modal>
  );
};

export const Pager: React.FC<{
  page: number;
  pages: number;
  total: number;
  limit: number;
  onPage: (page: number) => void;
  disabled?: boolean;
}> = ({ page, pages, total, limit, onPage, disabled = false }) => {
  const first = total === 0 ? 0 : (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);
  return (
    <div className="px-6 py-4 border-t border-neutral-100 flex items-center justify-between gap-3">
      <div className="text-xs text-neutral-500 font-medium">
        {total === 0 ? 'No results' : (
          <>Showing <span className="font-semibold text-neutral-800">{first}</span>–<span className="font-semibold text-neutral-800">{last}</span> of <span className="font-semibold text-neutral-800">{total}</span></>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-neutral-400">Page {page} of {Math.max(pages, 1)}</span>
        <button
          type="button"
          aria-label="Previous page"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={disabled || page <= 1}
          className="p-1.5 border border-neutral-200 rounded-lg hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FiChevronLeft size={14} className="text-neutral-600" />
        </button>
        <button
          type="button"
          aria-label="Next page"
          onClick={() => onPage(page + 1)}
          disabled={disabled || page >= pages}
          className="p-1.5 border border-neutral-200 rounded-lg hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FiChevronRight size={14} className="text-neutral-600" />
        </button>
      </div>
    </div>
  );
};

/** A segmented filter, the style every tab already used for its view toggles. */
export function FilterPills<T extends string>({ value, options, onChange }: {
  value: T;
  options: ReadonlyArray<{ key: T; label: string }>;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`px-4 py-2 text-xs font-semibold rounded-xl transition-colors ${value === o.key ? 'bg-[#0097b2] text-white' : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
