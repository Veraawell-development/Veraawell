import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { IndianRupee, Video, Mic, Landmark, Clock, CheckCircle, XCircle, BarChart3, ArrowLeft, Lightbulb, Check, RotateCcw } from 'lucide-react';
import { getAuthToken } from '../utils/authToken';
// Was `import.meta.env.VITE_API_URL || '/api'` — the only use of VITE_API_URL
// in the client, and the variable is not set. Locally the '/api' fallback
// works via the Vite proxy, but in production the frontend and API are on
// different origins, so all five requests on this page hit veraawell.com/api,
// got index.html back from the Vercel SPA rewrite, and died on JSON.parse.
// This entire page was inert in production.
import { API_BASE_URL } from '../config/api';

/*
 * Design tokens, identical to the doctor and patient dashboards. This page is
 * entered from the dashboard's "Pricing & Payouts" button, so it should look
 * like the dashboard — it was the only file in client/src using Instrument
 * Serif, and its root set no font at all, so everything but four headings fell
 * back to Inter. That is why it read as flat sans.
 *
 * Note the Tailwind `font-serif` / `font-mono` utilities are NOT usable here:
 * there is no tailwind.config and no @theme block, so they resolve to
 * Tailwind's stock stacks rather than the app's faces. The family has to be
 * set explicitly, exactly as the dashboards do.
 */
const T = {
  bg: '#f6f3ec',
  border: 'rgba(27,43,46,.08)',
  text: '#16262a',
  text2: '#6b7573',
  muted: '#8a938f',
  teal: '#1f7a8c',
  tealSoft: 'rgba(31,122,140,.10)',
};
const FONT_SERIF = "'Newsreader', Georgia, serif";
const FONT_SANS = "'Public Sans', 'Inter', sans-serif";

const cardStyle: React.CSSProperties = {
  background: 'radial-gradient(120% 120% at 0% 0%, rgba(31,122,140,.16), rgba(31,122,140,0) 55%), rgba(255,255,255,.82)',
  backdropFilter: 'blur(20px) saturate(110%)',
  WebkitBackdropFilter: 'blur(20px) saturate(110%)',
  border: '1px solid rgba(255,255,255,.7)',
  boxShadow: '0 12px 36px rgba(27,43,46,.08), inset 0 1px 0 rgba(255,255,255,.6)',
  borderRadius: 20,
};

/** Uppercase micro-label, the dashboard's eyebrow treatment. */
const eyebrow: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 9.5,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: T.muted,
};

/** Money. Serif at the dashboard's metric weight, with aligned digits. */
const figure: React.CSSProperties = {
  fontFamily: FONT_SERIF,
  fontWeight: 500,
  color: T.text,
  fontVariantNumeric: 'tabular-nums',
};

interface PricingState {
  session20: string;
  session40: string;
  session55: string;
  audio: {
    session20: string;
    session40: string;
    session55: string;
  };
}

/** What the doctor submits, and what comes back (masked). */
interface BankForm {
  accountHolderName: string;
  accountNumber: string;
  ifsc: string;
  panNumber: string;
}

interface BankDetailsState {
  status: 'not_submitted' | 'pending_admin_approval' | 'approved' | 'rejected';
  payoutApproved: boolean;
  approvedAt: string | null;
  rejectionReason: string | null;
  details: {
    accountHolderName: string;
    accountNumberMasked: string;
    ifsc: string;
    panMasked: string;
    submittedAt: string;
  } | null;
}

interface EarningsStats {
  totalDoctorEarnings: number;
  totalGross: number;
  totalSessions: number;
  pendingPayout: number;
}

const DoctorSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [pricing, setPricing] = useState<PricingState>({
    session20: '',
    session40: '',
    session55: '',
    audio: { session20: '', session40: '', session55: '' }
  });

  const [platformFeePercent] = useState(20); // Default — can be fetched dynamically later
  const [isSavingPricing, setIsSavingPricing] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 3;
  const [profileLoading, setProfileLoading] = useState(true);
  const [earnings, setEarnings] = useState<EarningsStats | null>(null);

  const [bank, setBank] = useState<BankDetailsState | null>(null);
  const [bankForm, setBankForm] = useState<BankForm>({
    accountHolderName: '', accountNumber: '', ifsc: '', panNumber: ''
  });
  const [bankErrors, setBankErrors] = useState<Partial<Record<keyof BankForm, string>>>({});
  const [isSavingBank, setIsSavingBank] = useState(false);
  const [editingBank, setEditingBank] = useState(false);


  const token = getAuthToken();

  /*
   * Mirrors the server's validation in controllers/payout.controller.js.
   *
   * Duplicated on purpose — the server is authoritative and rejects bad
   * input regardless, but a wrong IFSC caught only after a round trip is a
   * worse experience for the one form on the site where a typo means money
   * reaching the wrong account.
   */
  const BANK_RULES: Record<keyof BankForm, { test: (v: string) => boolean; message: string }> = {
    accountHolderName: {
      test: (v) => v.trim().length >= 3,
      message: 'Enter the name exactly as it appears on the bank account'
    },
    accountNumber: {
      test: (v) => /^\d{9,18}$/.test(v.replace(/\s/g, '')),
      message: 'Account number must be 9 to 18 digits'
    },
    ifsc: {
      test: (v) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.trim().toUpperCase()),
      message: 'IFSC must be 11 characters, e.g. HDFC0001234'
    },
    panNumber: {
      test: (v) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v.trim().toUpperCase()),
      message: 'PAN must be 10 characters, e.g. ABCDE1234F'
    }
  };

  const validateBank = (form: BankForm) => {
    const errors: Partial<Record<keyof BankForm, string>> = {};
    (Object.keys(BANK_RULES) as (keyof BankForm)[]).forEach((field) => {
      if (!BANK_RULES[field].test(form[field] || '')) errors[field] = BANK_RULES[field].message;
    });
    return errors;
  };

  const handleSubmitBank = async () => {
    const errors = validateBank(bankForm);
    setBankErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSavingBank(true);
    try {
      const res = await fetch(`${API_BASE_URL}/payouts/bank-details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
        body: JSON.stringify(bankForm)
      });
      const data = await res.json();
      if (!res.ok) {
        // The server returns per-field errors; show them against the fields
        // rather than collapsing everything into one toast.
        if (data.errors) setBankErrors(data.errors);
        toast.error(data.message || 'Could not save your bank details');
        return;
      }
      toast.success(data.message || 'Submitted for review');
      setEditingBank(false);
      await loadBankDetails();
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setIsSavingBank(false);
    }
  };

  const loadBankDetails = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/payouts/bank-details`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include'
      });
      if (res.ok) setBank(await res.json());
    } catch {
      /* the section renders its own loading state */
    }
  };

  // ── Load current pricing, bank details and earnings on mount ──────────────
  useEffect(() => {
    const loadData = async () => {
      try {
        const [profileRes, statsRes, bankRes] = await Promise.all([
          fetch(`${API_BASE_URL}/profile/setup`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          fetch(`${API_BASE_URL}/sessions/stats`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          fetch(`${API_BASE_URL}/payouts/bank-details`, {
            headers: { Authorization: `Bearer ${token}` }, credentials: 'include'
          })
        ]);

        if (bankRes.ok) {
          const bankData: BankDetailsState = await bankRes.json();
          setBank(bankData);
          // Open the form straight away when there is nothing to show, so a
          // new doctor does not have to find a button first.
          if (bankData.status === 'not_submitted') setEditingBank(true);
          if (bankData.details) {
            setBankForm((f) => ({ ...f, accountHolderName: bankData.details!.accountHolderName || '', ifsc: bankData.details!.ifsc || '' }));
          }
        }

        if (profileRes.ok) {
          const profileData = await profileRes.json();
          const p = profileData.profile;
          if (p) {
            setPricing({
              session20: p.price20 || '',
              session40: p.price40 || '',
              session55: p.price55 || '',
              audio: {
                session20: p.audioPrice20 || '',
                session40: p.audioPrice40 || '',
                session55: p.audioPrice55 || '',
              }
            });
          }
        }

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setEarnings({
            totalDoctorEarnings: statsData.totalDoctorEarnings || 0,
            totalGross: statsData.totalGross || 0,
            totalSessions: statsData.totalSessions || 0,
            pendingPayout: statsData.pendingPayout || 0
          });
        }
      } catch (err) {
        console.error('Failed to load doctor settings', err);
      } finally {
        setProfileLoading(false);
      }
    };


    loadData();
  }, [token]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const doctorEarns = (price: string) => {
    const p = parseFloat(price);
    if (!p || isNaN(p)) return '—';
    const earned = Math.round(p * (1 - platformFeePercent / 100));
    return `₹${earned.toLocaleString('en-IN')}`;
  };

  // ── Save Pricing ─────────────────────────────────────────────────────────────
  const handleSavePricing = async () => {
    setIsSavingPricing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/profile/pricing`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          pricing: {
            session20: Number(pricing.session20) || 0,
            session40: Number(pricing.session40) || 0,
            session55: Number(pricing.session55) || 0,
            audio: {
              session20: Number(pricing.audio.session20) || 0,
              session40: Number(pricing.audio.session40) || 0,
              session55: Number(pricing.audio.session55) || 0,
            }
          }
        })
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Pricing saved! New rates apply to future bookings.');
      } else {
        toast.error(data.message || 'Failed to save pricing');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setIsSavingPricing(false);
    }
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen pt-[64px] md:pt-[80px] box-border flex items-center justify-center" style={{ background: '#f8fafc' }}>
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: T.teal, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const videoSlots = [
    { key: 'session20' as const, label: '20 Minutes' },
    { key: 'session40' as const, label: '40 Minutes' },
    { key: 'session55' as const, label: '55 Minutes' },
  ];

  // The Navbar is position: fixed, so a full-height page has to reserve its
  // height or its own header renders behind the nav links. This is the same
  // offset DoctorReportsPage, DoctorTasksPage and PatientDetailsPage use;
  // box-border keeps h-screen from overflowing once the padding is added.
  return (
    <div className="h-screen pt-[64px] md:pt-[80px] box-border overflow-hidden flex flex-col" style={{ background: T.bg, fontFamily: FONT_SANS }}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-4 py-5 flex-shrink-0" style={{ borderBottom: `1px solid ${T.border}`, background: 'rgba(255,255,255,.7)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/doctor-dashboard')}
              className="p-2 rounded-full transition-colors"
              style={{ color: T.text2 }}
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div style={{ ...eyebrow, fontSize: 10, letterSpacing: '.1em', color: T.teal, marginBottom: 2 }}>— Your Practice</div>
              <h1 style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 24, lineHeight: 1.15, color: T.text }}>Pricing &amp; Payouts</h1>
            </div>
          </div>

          <div style={{ ...eyebrow, fontSize: 10, letterSpacing: '.1em' }}>
            Step {currentStep} of {totalSteps}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6 flex-1 w-full overflow-y-auto">

        {/* ── SESSION PRICING CARD (STEP 1) ───────────────────────────────────────────── */}
        {currentStep === 1 && (
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <div className="px-6 py-5" style={{ borderBottom: `1px solid ${T.border}` }}>
            <h2 className="flex items-center gap-2" style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 17, lineHeight: 1.2, color: T.text }}>
              <IndianRupee className="w-[18px] h-[18px]" style={{ color: T.teal }} /> Session Pricing
            </h2>
            <p className="mt-1" style={{ fontSize: 12.5, color: T.text2 }}>
              Changes apply to future bookings only. Existing sessions are not affected.
            </p>
          </div>

          <div className="p-6 flex flex-col h-full">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Video Pricing */}
              <div>
              <h3 className="mb-4 flex items-center gap-2" style={{ ...eyebrow, color: T.teal }}>
                <Video className="w-3.5 h-3.5" /> Video Sessions
              </h3>
              <div className="space-y-3">
                {videoSlots.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-3">
                    <label className="w-24 shrink-0" style={{ fontSize: 12.5, fontWeight: 500, color: T.text2 }}>{label}</label>
                    <div className="flex items-center gap-2 flex-1">
                      {/* minWidth so a four-digit price is never clipped —
                          this row previously rendered ₹800 as "₹ 8". */}
                      <div className="relative flex-1" style={{ minWidth: 104, maxWidth: 144 }}>
                        <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ ...figure, fontSize: 15, color: T.muted }}>₹</span>
                        <input
                          type="number"
                          min="0"
                          max="10000"
                          value={pricing[key]}
                          onChange={e => setPricing(p => ({ ...p, [key]: e.target.value }))}
                          className="w-full pl-7 pr-3 py-2.5 rounded-xl focus:outline-none focus:ring-2 transition-all"
                          style={{ ...figure, fontSize: 17, border: `1px solid ${T.border}`, background: 'rgba(255,255,255,.6)' }}
                          placeholder="0"
                        />
                      </div>
                      <span className="shrink-0" style={{ fontSize: 11.5, color: T.muted }}>
                        You earn: <span style={{ ...figure, fontSize: 13.5, color: T.teal }}>{doctorEarns(pricing[key])}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Audio Pricing */}
            <div>
              {/* One accent, not two. Teal for both; audio is distinguished by
                  the icon, not by a second brand-adjacent blue. */}
              <h3 className="mb-4 flex items-center gap-2" style={{ ...eyebrow, color: T.teal }}>
                <Mic className="w-3.5 h-3.5" /> Audio Sessions
              </h3>
              <div className="space-y-3">
                {videoSlots.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-3">
                    <label className="w-24 shrink-0" style={{ fontSize: 12.5, fontWeight: 500, color: T.text2 }}>{label}</label>
                    <div className="flex items-center gap-2 flex-1">
                      {/* minWidth so a four-digit price is never clipped —
                          this row previously rendered ₹800 as "₹ 8". */}
                      <div className="relative flex-1" style={{ minWidth: 104, maxWidth: 144 }}>
                        <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ ...figure, fontSize: 15, color: T.muted }}>₹</span>
                        <input
                          type="number"
                          min="0"
                          max="10000"
                          value={pricing.audio[key]}
                          onChange={e => setPricing(p => ({ ...p, audio: { ...p.audio, [key]: e.target.value } }))}
                          className="w-full pl-7 pr-3 py-2.5 rounded-xl focus:outline-none focus:ring-2 transition-all"
                          style={{ ...figure, fontSize: 17, border: `1px solid ${T.border}`, background: 'rgba(255,255,255,.6)' }}
                          placeholder="0"
                        />
                      </div>
                      <span className="shrink-0" style={{ fontSize: 11.5, color: T.muted }}>
                        You earn: <span style={{ ...figure, fontSize: 13.5, color: T.teal }}>{doctorEarns(pricing.audio[key])}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </div>

            {/* Info banner */}
            <div className="rounded-xl p-4 mt-auto flex items-start gap-3" style={{ background: T.tealSoft, border: `1px solid ${T.border}` }}>
              <Lightbulb className="w-5 h-5 shrink-0 mt-0.5" style={{ color: T.teal }} />
              <p className="leading-relaxed" style={{ fontSize: 12, color: T.text2 }}>
                Platform fee: <strong className="font-semibold">{platformFeePercent}%</strong>. The "You earn" amount is transferred to your bank account within 3 business days after each completed session.
              </p>
            </div>

            <button
              onClick={handleSavePricing}
              disabled={isSavingPricing}
              className="w-full py-3 rounded-full transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: T.teal, color: '#fff', fontWeight: 600, fontSize: 13, letterSpacing: '.04em', textTransform: 'uppercase', border: 'none' }}
            >
              {isSavingPricing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <><Check className="w-4 h-4" /> Save Pricing</>
              )}
            </button>
          </div>
        </div>
        )}

        {/* ── PAYOUT SETUP CARD (STEP 2) ──────────────────────────────────────────────── */}
        {currentStep === 2 && (
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <div className="px-6 py-5" style={{ borderBottom: `1px solid ${T.border}` }}>
            <h2 className="flex items-center gap-2" style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 17, lineHeight: 1.2, color: T.text }}>
              <Landmark className="w-[18px] h-[18px]" style={{ color: T.teal }} /> Payout Setup
            </h2>
            <p className="mt-1" style={{ fontSize: 12.5, color: T.text2 }}>
              Set up your bank account to receive earnings after sessions.
            </p>
          </div>

          <div className="p-6">
            {!bank ? (
              <div className="flex items-center gap-3" style={{ color: T.muted }}>
                <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: T.muted, borderTopColor: 'transparent' }} />
                <span className="text-sm">Loading status...</span>
              </div>
            ) : (
              <>
                {/*
                  Status first, then the form. The status is what the doctor
                  came to check; the form is what they came to change, and
                  only when something needs changing.
                */}
                {bank.status === 'approved' && !editingBank && (
                  <div className="rounded-xl p-4 mb-4 bg-green-50 border border-green-100">
                    <div className="flex items-start gap-2.5">
                      <CheckCircle className="w-[18px] h-[18px] mt-px text-green-600 shrink-0" />
                      <div>
                        <p className="font-semibold text-sm text-green-900">Payouts active</p>
                        <p className="mt-0.5" style={{ fontSize: 12.5, color: T.text2 }}>
                          You can take bookings. Earnings are transferred every Tuesday for the week before.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {bank.status === 'pending_admin_approval' && (
                  <div className="rounded-xl p-4 mb-4 bg-amber-50 border border-amber-100">
                    <div className="flex items-start gap-2.5">
                      <Clock className="w-[18px] h-[18px] mt-px text-amber-600 shrink-0" />
                      <div>
                        <p className="font-semibold text-sm text-amber-900">Pending review</p>
                        <p className="mt-0.5" style={{ fontSize: 12.5, color: T.text2 }}>
                          An admin is checking your details. You will be able to take bookings once they are approved.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {bank.status === 'rejected' && (
                  <div className="rounded-xl p-4 mb-4 bg-red-50 border border-red-100">
                    <div className="flex items-start gap-2.5">
                      <XCircle className="w-[18px] h-[18px] mt-px text-red-600 shrink-0" />
                      <div>
                        <p className="font-semibold text-sm text-red-900">Details not accepted</p>
                        <p className="mt-0.5" style={{ fontSize: 12.5, color: T.text2 }}>
                          {bank.rejectionReason || 'Please check your details and submit again.'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* What is on file, when not editing. */}
                {bank.details && !editingBank && (
                  <div className="rounded-xl p-4 mb-4" style={{ background: T.tealSoft }}>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                      {[
                        ['Account holder', bank.details.accountHolderName],
                        ['Account number', bank.details.accountNumberMasked],
                        ['IFSC', bank.details.ifsc],
                        ['PAN', bank.details.panMasked]
                      ].map(([label, value]) => (
                        <div key={label as string}>
                          <div style={eyebrow}>{label}</div>
                          <div className="mt-0.5" style={{ ...figure, fontSize: 14 }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => { setEditingBank(true); setBankErrors({}); }}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wide"
                      style={{ background: 'transparent', color: T.teal, border: `1px solid rgba(31,122,140,.35)` }}
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Change bank account
                    </button>
                  </div>
                )}

                {editingBank && (
                  <div>
                    {bank.status === 'approved' && (
                      <div className="rounded-xl p-3 mb-4 flex items-start gap-2.5" style={{ background: T.tealSoft }}>
                        <Lightbulb className="w-[18px] h-[18px] mt-px shrink-0" style={{ color: T.teal }} />
                        <p style={{ fontSize: 12.5, color: T.text2 }}>
                          Changing your account needs a fresh approval, and you will not be bookable until that comes through.
                        </p>
                      </div>
                    )}

                    <div className="space-y-4">
                      {([
                        { key: 'accountHolderName', label: 'Account holder name', placeholder: 'As printed on your bank account', mode: 'text' },
                        { key: 'accountNumber', label: 'Account number', placeholder: '9 to 18 digits', mode: 'numeric' },
                        { key: 'ifsc', label: 'IFSC code', placeholder: 'HDFC0001234', mode: 'upper' },
                        { key: 'panNumber', label: 'PAN', placeholder: 'ABCDE1234F', mode: 'upper' }
                      ] as const).map((field) => (
                        <div key={field.key}>
                          {/* Label above the input, not beside it: the fixed
                              w-24 label used by the pricing rows is too narrow
                              for "Account holder name". */}
                          <label htmlFor={field.key} className="block mb-1.5" style={{ fontSize: 12.5, fontWeight: 500, color: T.text2 }}>
                            {field.label}
                          </label>
                          <input
                            id={field.key}
                            value={bankForm[field.key]}
                            inputMode={field.mode === 'numeric' ? 'numeric' : 'text'}
                            autoComplete="off"
                            aria-invalid={!!bankErrors[field.key]}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const value = field.mode === 'upper' ? raw.toUpperCase()
                                : field.mode === 'numeric' ? raw.replace(/[^\d]/g, '')
                                  : raw;
                              setBankForm((f) => ({ ...f, [field.key]: value }));
                              // Clear the error as soon as the value becomes
                              // valid, rather than making them submit to find out.
                              setBankErrors((errs) => {
                                if (!errs[field.key]) return errs;
                                if (!BANK_RULES[field.key].test(value)) return errs;
                                const next = { ...errs }; delete next[field.key]; return next;
                              });
                            }}
                            placeholder={field.placeholder}
                            className="w-full px-3 py-2.5 rounded-xl focus:outline-none focus:ring-2 transition-all"
                            style={{
                              ...figure, fontSize: 15,
                              border: `1px solid ${bankErrors[field.key] ? '#dc2626' : T.border}`,
                              background: 'rgba(255,255,255,.6)'
                            }}
                          />
                          {bankErrors[field.key] && (
                            <p className="mt-1" style={{ fontSize: 11.5, color: '#dc2626' }}>{bankErrors[field.key]}</p>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-3 mt-5">
                      <button
                        onClick={handleSubmitBank}
                        disabled={isSavingBank}
                        className="flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-bold text-sm text-white disabled:opacity-60"
                        style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                      >
                        {isSavingBank
                          ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Submitting...</>
                          : <><Landmark className="w-4 h-4" /> Submit for review</>}
                      </button>
                      {bank.details && (
                        <button
                          onClick={() => { setEditingBank(false); setBankErrors({}); }}
                          className="text-xs font-semibold uppercase tracking-wide"
                          style={{ color: T.muted, background: 'transparent' }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>

                    <p className="mt-4 leading-relaxed" style={{ fontSize: 11.5, color: T.muted }}>
                      Used only to transfer your earnings. An admin verifies these once before your first payout.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        )}

        {/* ── EARNINGS SUMMARY CARD (STEP 3) ─────────────────────────────────────── */}
        {currentStep === 3 && earnings !== null && (
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div className="px-6 py-5" style={{ borderBottom: `1px solid ${T.border}` }}>
              <h2 className="flex items-center gap-2" style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 17, lineHeight: 1.2, color: T.text }}>
                <BarChart3 className="w-[18px] h-[18px]" style={{ color: T.teal }} /> Earnings Summary
              </h2>
              <p className="mt-1" style={{ fontSize: 12.5, color: T.text2 }}>All-time stats from completed sessions</p>
            </div>
            {/*
              Same shape as the dashboard's Key Metrics: one array, one tile
              renderer, auto-rows-fr so every tile is the same size and every
              figure sits on the same line. Values are serif with tabular
              numerals so the rupee columns align digit-for-digit.
            */}
            <div className="p-6 grid grid-cols-2 auto-rows-fr gap-3">
              {[
                { label: 'Total Earned', value: `₹${earnings.totalDoctorEarnings.toLocaleString('en-IN')}`, note: 'after platform fee', span: false },
                { label: 'Pending Payout', value: `₹${earnings.pendingPayout.toLocaleString('en-IN')}`, note: 'processing within 3 days', span: false },
                { label: 'Sessions Completed', value: `${earnings.totalSessions}`, note: `Gross collected: ₹${earnings.totalGross.toLocaleString('en-IN')}`, span: true },
              ].map((m) => (
                <div
                  key={m.label}
                  className={m.span ? 'col-span-2' : ''}
                  style={{ background: 'rgba(255,255,255,.5)', border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}
                >
                  <div style={eyebrow}>{m.label}</div>
                  <div style={{ ...figure, fontSize: 24, lineHeight: 1.2 }}>{m.value}</div>
                  <div style={{ fontSize: 11.5, color: T.muted, marginTop: 'auto' }}>{m.note}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── WIZARD CONTROLS ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-6 mt-8">
          <button
            onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
            disabled={currentStep === 1}
            className={`px-6 py-2.5 rounded-xl font-medium text-sm transition-all ${
              currentStep === 1 
                ? 'opacity-0 pointer-events-none' 
                : 'hover:opacity-80'
            }`}
          >
            Previous
          </button>
          
          <button
            onClick={() => {
              if (currentStep < totalSteps) setCurrentStep(prev => prev + 1);
              else navigate('/doctor-dashboard');
            }}
            className="px-6 py-2.5 rounded-full transition-all hover:opacity-90"
            style={{ background: T.teal, color: '#fff', fontWeight: 600, fontSize: 12.5, letterSpacing: '.04em', textTransform: 'uppercase', border: 'none' }}
          >
            {currentStep === totalSteps ? 'Done' : 'Next'}
          </button>
        </div>

      </div>
    </div>
  );
};

export default DoctorSettingsPage;
