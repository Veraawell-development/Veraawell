import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { IndianRupee, Video, Mic, Landmark, Clock, Mail, CheckCircle, XCircle, BarChart3, ArrowLeft, Lightbulb } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

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

interface OnboardingStatus {
  status: 'not_requested' | 'pending_admin_approval' | 'submitted_to_razorpay' | 'active' | 'rejected';
  message: string;
  requestedAt: string | null;
  activatedAt: string | null;
  isActive: boolean;
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
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);
  const [isRequestingOnboarding, setIsRequestingOnboarding] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 3;
  const [profileLoading, setProfileLoading] = useState(true);
  const [earnings, setEarnings] = useState<EarningsStats | null>(null);


  const token = localStorage.getItem('token');

  // ── Load current pricing & onboarding status on mount ──────────────────────
  useEffect(() => {
    const loadData = async () => {
      try {
        const [profileRes, onboardingRes, statsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/profile/setup`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          fetch(`${API_BASE_URL}/payments/onboarding-status`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          fetch(`${API_BASE_URL}/sessions/stats`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);

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

        if (onboardingRes.ok) {
          const onboardingData = await onboardingRes.json();
          setOnboardingStatus(onboardingData);
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

  // ── Request Payout Onboarding ─────────────────────────────────────────────
  const handleRequestOnboarding = async () => {
    setIsRequestingOnboarding(true);
    try {
      const res = await fetch(`${API_BASE_URL}/payments/request-onboarding`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Request submitted! Admin will review and approve.');
        setOnboardingStatus(prev => prev ? { ...prev, status: 'pending_admin_approval', message: data.message } : null);
      } else {
        toast.error(data.message || 'Failed to submit request');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setIsRequestingOnboarding(false);
    }
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f8fafc' }}>
        <div className="w-8 h-8 border-4 border-teal-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const videoSlots = [
    { key: 'session20' as const, label: '20 Minutes' },
    { key: 'session40' as const, label: '40 Minutes' },
    { key: 'session55' as const, label: '55 Minutes' },
  ];

  return (
    <div className="h-screen overflow-hidden bg-[#FAFAF8] flex flex-col">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-4 py-6 border-b border-gray-200 bg-white shadow-sm flex-shrink-0">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/doctor-dashboard')} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-700">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-3xl text-gray-900" style={{ fontFamily: 'Instrument Serif, serif' }}>Pricing & Payouts</h1>
            </div>
            <p className="text-sm text-gray-500 ml-12 mt-1">Manage your pricing & payout setup</p>
          </div>
          
          <div className="text-sm font-medium text-gray-500">
            Step {currentStep} of {totalSteps}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 flex-1 w-full overflow-y-auto">

        {/* ── SESSION PRICING CARD (STEP 1) ───────────────────────────────────────────── */}
        {currentStep === 1 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-50" style={{ background: 'linear-gradient(135deg, #F0F8F9 0%, #F5FBFC 100%)' }}>
            <h2 className="text-lg text-gray-800 flex items-center gap-2" style={{ fontFamily: 'Instrument Serif, serif' }}>
              <IndianRupee className="w-5 h-5 text-teal-600" /> Session Pricing
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Changes apply to future bookings only. Existing sessions are not affected.
            </p>
          </div>

          <div className="p-6 flex flex-col h-full">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Video Pricing */}
              <div>
              <h3 className="text-[11px] font-bold text-teal-700 tracking-wider mb-4 flex items-center gap-2 uppercase">
                <Video className="w-4 h-4" /> Video Sessions
              </h3>
              <div className="space-y-3">
                {videoSlots.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-3">
                    <label className="text-sm font-medium text-gray-600 w-28 shrink-0">{label}</label>
                    <div className="flex items-center gap-2 flex-1">
                      <div className="relative flex-1 max-w-36">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">₹</span>
                        <input
                          type="number"
                          min="0"
                          max="10000"
                          value={pricing[key]}
                          onChange={e => setPricing(p => ({ ...p, [key]: e.target.value }))}
                          className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition-all"
                          placeholder="0"
                        />
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">
                        You earn: <span className="text-teal-600 font-semibold">{doctorEarns(pricing[key])}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Audio Pricing */}
            <div>
              <h3 className="text-[11px] font-bold text-blue-700 tracking-wider mb-4 flex items-center gap-2 uppercase">
                <Mic className="w-4 h-4" /> Audio Sessions
              </h3>
              <div className="space-y-3">
                {videoSlots.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-3">
                    <label className="text-sm font-medium text-gray-600 w-28 shrink-0">{label}</label>
                    <div className="flex items-center gap-2 flex-1">
                      <div className="relative flex-1 max-w-36">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">₹</span>
                        <input
                          type="number"
                          min="0"
                          max="10000"
                          value={pricing.audio[key]}
                          onChange={e => setPricing(p => ({ ...p, audio: { ...p.audio, [key]: e.target.value } }))}
                          className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all"
                          placeholder="0"
                        />
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">
                        You earn: <span className="text-blue-600 font-semibold">{doctorEarns(pricing.audio[key])}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </div>

            {/* Info banner */}
            <div className="bg-teal-50/50 rounded-xl p-4 mt-auto flex items-start gap-3 border border-teal-100/50">
              <Lightbulb className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
              <p className="text-xs text-teal-800 leading-relaxed">
                Platform fee: <strong className="font-semibold">{platformFeePercent}%</strong>. The "You earn" amount is transferred to your bank account within 3 business days after each completed session.
              </p>
            </div>

            <button
              onClick={handleSavePricing}
              disabled={isSavingPricing}
              className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}
            >
              {isSavingPricing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>✓ Save Pricing</>
              )}
            </button>
          </div>
        </div>
        )}

        {/* ── PAYOUT SETUP CARD (STEP 2) ──────────────────────────────────────────────── */}
        {currentStep === 2 && (
        <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-50" style={{ background: 'linear-gradient(135deg, #FEF8F3 0%, #fff 100%)' }}>
            <h2 className="text-lg text-gray-800 flex items-center gap-2" style={{ fontFamily: 'Instrument Serif, serif' }}>
              <Landmark className="w-5 h-5 text-orange-600" /> Payout Setup
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Set up your bank account to receive earnings after sessions.
            </p>
          </div>

          <div className="p-6">
            {!onboardingStatus ? (
              <div className="flex items-center gap-3 text-gray-400">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Loading status...</span>
              </div>
            ) : onboardingStatus.status === 'not_requested' ? (
              <div>
                <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                  Set up payouts to receive your earnings automatically. Once active, earnings are transferred within <strong>3 business days</strong> after each completed session.
                </p>
                <button
                  onClick={handleRequestOnboarding}
                  disabled={isRequestingOnboarding}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                >
                  {isRequestingOnboarding ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Landmark className="w-4 h-4" />
                  )}
                  {isRequestingOnboarding ? 'Submitting...' : 'Request Payout Setup'}
                </button>
              </div>
            ) : onboardingStatus.status === 'pending_admin_approval' ? (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl p-4">
                <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm text-amber-800">Pending Admin Review</p>
                  <p className="text-xs text-amber-700 mt-1">
                    Your request has been submitted. Our admin team will review and approve it. You'll be notified via email.
                  </p>
                </div>
              </div>
            ) : onboardingStatus.status === 'submitted_to_razorpay' ? (
              <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4">
                <Mail className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm text-blue-800">Check Your Email from Razorpay</p>
                  <p className="text-xs text-blue-700 mt-1">
                    We've submitted your details to Razorpay. They will send you a KYC link. Complete it to activate your payouts.
                  </p>
                  <p className="text-xs text-blue-500 mt-2">
                    Didn't receive the email? Contact us at <a href="mailto:contact@veraawell.com" className="underline">contact@veraawell.com</a>
                  </p>
                </div>
              </div>
            ) : onboardingStatus.status === 'active' ? (
              <div className="flex items-start gap-3 bg-green-50 border border-green-100 rounded-xl p-4">
                <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm text-green-800">Payouts Active</p>
                  <p className="text-xs text-green-700 mt-1">
                    Your earnings are automatically transferred to your bank account within 3 business days after each completed session.
                  </p>
                  {onboardingStatus.activatedAt && (
                    <p className="text-xs text-green-500 mt-1">
                      Active since {new Date(onboardingStatus.activatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
            ) : onboardingStatus.status === 'rejected' ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl p-4">
                  <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm text-red-800">Request Not Approved</p>
                    <p className="text-xs text-red-700 mt-1">{onboardingStatus.message}</p>
                    <p className="text-xs text-red-500 mt-2">
                      Need help? Contact <a href="mailto:contact@veraawell.com" className="underline">contact@veraawell.com</a>
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleRequestOnboarding}
                  disabled={isRequestingOnboarding}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-gray-700 hover:bg-gray-800 transition-all disabled:opacity-60"
                >
                  {isRequestingOnboarding ? 'Submitting...' : '↩ Re-apply'}
                </button>
              </div>
            ) : null}
          </div>
        </div>
        )}

        {/* ── EARNINGS SUMMARY CARD (STEP 3) ─────────────────────────────────────── */}
        {currentStep === 3 && earnings !== null && (
          <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-50" style={{ background: 'linear-gradient(135deg, #F0FBFC 0%, #fff 100%)' }}>
              <h2 className="text-lg text-gray-800 flex items-center gap-2" style={{ fontFamily: 'Instrument Serif, serif' }}>
                <BarChart3 className="w-5 h-5 text-blue-600" /> Earnings Summary
              </h2>
              <p className="text-xs text-gray-500 mt-1">All-time stats from completed sessions</p>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="bg-teal-50 rounded-xl p-4">
                <p className="text-xs text-teal-600 font-medium mb-1">Total Earned</p>
                <p className="text-2xl font-bold text-teal-700">
                  ₹{earnings.totalDoctorEarnings.toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-gray-400 mt-1">after platform fee</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-4">
                <p className="text-xs text-blue-600 font-medium mb-1">Pending Payout</p>
                <p className="text-2xl font-bold text-blue-700">
                  ₹{earnings.pendingPayout.toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-gray-400 mt-1">processing within 3 days</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 col-span-2">
                <p className="text-xs text-gray-500 font-medium mb-1">Total Sessions Completed</p>
                <p className="text-xl font-bold text-gray-700">{earnings.totalSessions} sessions</p>
                <p className="text-xs text-gray-400 mt-1">Gross collected: ₹{earnings.totalGross.toLocaleString('en-IN')}</p>
              </div>
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
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
            }`}
          >
            Previous
          </button>
          
          <button
            onClick={() => {
              if (currentStep < totalSteps) setCurrentStep(prev => prev + 1);
              else navigate('/doctor-dashboard');
            }}
            className="px-6 py-2.5 rounded-xl font-bold text-sm text-white transition-all bg-teal-700 hover:bg-teal-800"
          >
            {currentStep === totalSteps ? 'Done' : 'Next'}
          </button>
        </div>

      </div>
    </div>
  );
};

export default DoctorSettingsPage;
