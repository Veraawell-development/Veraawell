import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { resolveSessionStart, formatSessionDay, PLATFORM_TIMEZONE } from '../utils/dateUtils';
import { resolveSessionPrice, offeredDurations, startingPrice, formatINR } from '../utils/sessionPricing';
import type { SessionMode } from '../utils/sessionPricing';
import { doctorDisplayName, doctorInitials, experienceLabel } from '../utils/doctorName';
import { savePendingBooking, readPendingBooking, clearPendingBooking } from '../utils/pendingBooking';
import { loadRazorpay, abandonResult, paymentOutcome } from '../utils/razorpayCheckout';
import { FiVideo, FiPhone, FiRadio, FiCheck, FiClock } from 'react-icons/fi';
import { getDoctorAccentColor } from '../utils/doctorColor';

interface BookingState {
  mode: 'video' | 'voice';
  duration: number;
  /** null: this doctor doesn't offer the selected duration/mode. */
  price: number | null;
  date: string;
  timeSlot: string;
}

interface DoctorProfile {
  _id: string;
  userId: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  specialization: string[];
  experience: number;
  qualification: string[];
  languages: string[];
  treatsFor: string[];
  pricing: {
    min: number;
    max: number;
    session20?: number;
    session40?: number;
    session55?: number;
    audio?: {
      session20?: number;
      session40?: number;
      session55?: number;
    };
  };
  profileImage: string;
  bannerImage?: string;
  bio: string;
  isOnline: boolean;
  rating: {
    average: number;
    totalReviews: number;
  };
  quote?: string;
  quoteAuthor?: string;
  /** From the server: can a time slot / an instant session be booked at all. */
  bookable?: boolean;
  instantBookable?: boolean;
  openDates?: string[];
}

/**
 * Where the booking is: picking options, reviewing the summary, waiting for
 * the payment to be confirmed, or done (booked — or, rarely, not).
 */
type Stage = 'choose' | 'review' | 'confirming' | 'done';

interface BookingResult {
  outcome: 'paid' | 'pending' | 'failed';
  price: number;
  date: string;
  timeSlot: string;
  mode: SessionMode;
  duration: number;
}

/** A stable empty list: `data = []` in a query made a new array each render and fed an effect loop. */
const NO_SLOTS: string[] = [];
const CONFIRM_POLL_MS = 3000;
const CONFIRM_POLL_TRIES = 20;

class BookingError extends Error {
  reason?: string;
  status?: number;
  constructor(message: string, reason?: string, status?: number) {
    super(message);
    this.reason = reason;
    this.status = status;
  }
}

const DoctorProfilePage: React.FC = () => {
  const { doctorId } = useParams<{ doctorId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoggedIn, user } = useAuth();
  const queryClient = useQueryClient();

  // A selection parked before sign-in (utils/pendingBooking.ts). Read once:
  // sign-in, sign-up + code and Google all come back here, and the patient
  // used to have to pick everything again.
  const [pending] = useState(() => readPendingBooking(doctorId));
  const navState = (location.state as { serviceType?: string; bookingType?: string } | null) || {};
  const serviceType = navState.serviceType ?? pending?.serviceType;
  const [bookingType, setBookingType] = useState<'scheduled' | 'immediate'>(() => {
    const requested = navState.bookingType ?? pending?.bookingType;
    return requested === 'immediate' ? 'immediate' : 'scheduled';
  });
  const isImmediate = bookingType === 'immediate';

  const [booking, setBooking] = useState<BookingState>({
    mode: pending?.mode ?? 'video',
    duration: pending?.duration ?? 20,
    price: null,
    date: pending?.date ?? '',
    timeSlot: pending?.timeSlot ?? ''
  });
  const [stage, setStage] = useState<Stage>('choose');
  const [result, setResult] = useState<BookingResult | null>(null);
  const restored = useRef(false);
  const pollTimer = useRef<number | null>(null);
  useEffect(() => () => { if (pollTimer.current) window.clearTimeout(pollTimer.current); }, []);

  // The therapist's own price for this exact slot (utils/sessionPricing.ts),
  // or null when they haven't set one.
  const getPriceForDurationAndMode = (dur: number, selectedMode: SessionMode): number | null =>
    resolveSessionPrice(doctorProfile?.pricing, dur, selectedMode);

  /** The requested duration/mode if bookable, else the nearest one that is. */
  const pickBookable = (mode: SessionMode, duration: number): Pick<BookingState, 'mode' | 'duration' | 'price'> => {
    const pricing = doctorProfile?.pricing;
    const price = resolveSessionPrice(pricing, duration, mode);
    if (price !== null) return { mode, duration, price };
    for (const m of [mode, mode === 'video' ? 'voice' : 'video'] as SessionMode[]) {
      const [first] = offeredDurations(pricing, m);
      if (first) return { mode: m, duration: first, price: resolveSessionPrice(pricing, first, m) };
    }
    return { mode, duration, price: null };
  };

  const [availableDates, setAvailableDates] = useState<Array<{ date: string; weekday: string; dayNum: number; monthName: string }>>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [photoFailed, setPhotoFailed] = useState(false);

  const { data: doctorProfile, isLoading: profileLoading, error: profileError } = useQuery<DoctorProfile>({
    queryKey: ['doctor', doctorId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/sessions/doctors/${doctorId}`);
      if (!response.ok) throw new Error('Doctor not found');
      return response.json();
    },
    enabled: !!doctorId
  });

  const { data: doctorReviews = [], isLoading: reviewsLoading } = useQuery<any[]>({
    queryKey: ['doctor', 'reviews', doctorId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/reviews/doctor/${doctorId}?limit=10&includeAll=true`);
      if (!response.ok) throw new Error('Failed to fetch reviews');
      const data = await response.json();
      return data.reviews || [];
    },
    enabled: !!doctorId
  });

  // Whether the therapist can take an instant session right now — online and
  // not in a session (the directory's own list). A busy therapist used to be
  // sent to a checkout the server then refused. Asked for a scheduled booking
  // too, so the patient can switch between "Talk now" and "Book a time".
  const { data: onlineDoctors, isSuccess: onlineKnown } = useQuery<any[]>({
    queryKey: ['doctors', 'online'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/doctor-status/online-doctors`);
      if (!response.ok) throw new Error('Failed to fetch online doctors');
      const data = await response.json();
      return data.doctors || [];
    },
    enabled: !!doctorId,
    refetchInterval: stage === 'choose' ? 30_000 : false
  });
  const liveEntry = onlineDoctors?.find((d: any) => d._id === doctorId);
  const instantStatus: 'online' | 'busy' | 'offline' | 'unknown' = !onlineKnown
    ? 'unknown'
    : !liveEntry ? 'offline' : liveEntry.busy ? 'busy' : 'online';

  // Short-lived and refetched on focus: someone else can take a time while
  // this page sits open, and the list used to stay as it was for 5 minutes.
  const slotsQuery = useQuery<string[]>({
    queryKey: ['doctor', 'slots', doctorId, booking.date],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/sessions/doctors/${doctorId}/slots/${booking.date}`);
      if (!response.ok) throw new Error('Failed to fetch slots');
      const data = await response.json();
      // The server already leaves out passed and too-soon slots; this only
      // hides any that passed while the page sat open (IST wall-clock times).
      const earliest = Date.now() + 15 * 60 * 1000;
      return (data.availableSlots as string[]).filter((slot: string) =>
        resolveSessionStart({ sessionDate: booking.date, sessionTime: slot }).getTime() >= earliest
      );
    },
    enabled: !!doctorId && !!booking.date && !isImmediate,
    staleTime: 15_000,
    refetchOnWindowFocus: 'always',
    refetchInterval: stage === 'choose' ? 60_000 : false
  });
  const availableSlots = slotsQuery.data ?? NO_SLOTS;

  useEffect(() => {
    generateAvailableDates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId]);

  // Update initial booking price once profile is loaded
  useEffect(() => {
    if (doctorProfile) {
      setBooking(prev => ({ ...prev, ...pickBookable(prev.mode, prev.duration) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorProfile]);

  // A chosen time that is no longer offered (taken, or now too soon) is
  // dropped — only once the list for that day has actually loaded.
  useEffect(() => {
    if (!slotsQuery.data || !booking.timeSlot) return;
    if (!slotsQuery.data.includes(booking.timeSlot)) setBooking(prev => ({ ...prev, timeSlot: '' }));
  }, [slotsQuery.data, booking.timeSlot]);

  const loading = profileLoading;
  // Older API responses carry no flags: treat that as bookable, as before.
  const canBookHere = !doctorProfile
    || (isImmediate ? doctorProfile.instantBookable !== false : doctorProfile.bookable !== false);
  // Both ways are open when the therapist is online and free AND has dates
  // ahead. Opening the page from "Talk now" used to leave no way to book a
  // later time with the same therapist.
  const canChooseHow = !!doctorProfile
    && doctorProfile.bookable !== false
    && doctorProfile.instantBookable !== false
    && instantStatus === 'online';
  const error = profileError ? 'Failed to load doctor profile' : null;

  const generateAvailableDates = () => {
    const dates: Array<{ date: string; weekday: string; dayNum: number; monthName: string }> = [];
    // Days are IST days — the doctor's calendar is published in IST. The
    // viewer's own date used to be used, so a patient abroad (or anyone in
    // the hours around midnight) got a strip shifted by a day.
    const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: PLATFORM_TIMEZONE }).format(new Date()).split('-').map(Number);

    for (let i = 0; i < 14; i++) {
      const date = new Date(Date.UTC(y, m - 1, d + i));
      const dateStr = date.toISOString().slice(0, 10);
      const weekday = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
      const dayNum = date.getUTCDate();
      const monthName = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

      // The chip used to read the weekday back out of a "Oct 18 Sat" string
      // with split(' ')[1] — which is "18" — so it showed the day number twice.
      dates.push({ date: dateStr, weekday, dayNum, monthName });
    }

    setAvailableDates(dates);
    // Keep a day restored from before sign-in if it is still in the strip.
    setBooking(prev => ({ ...prev, date: prev.date && dates.some((x) => x.date === prev.date) ? prev.date : dates[0].date }));
  };

  const handleModeChange = (newMode: 'video' | 'voice') => {
    // Keep the duration if this mode offers it; otherwise move to one it does.
    setBooking(prev => {
      const price = getPriceForDurationAndMode(prev.duration, newMode);
      if (price !== null) return { ...prev, mode: newMode, price };
      const [first] = offeredDurations(doctorProfile?.pricing, newMode);
      return first
        ? { ...prev, mode: newMode, duration: first, price: getPriceForDurationAndMode(first, newMode) }
        : { ...prev, mode: newMode, price: null };
    });
  };

  const handleDurationChange = (duration: number) => {
    if (!doctorProfile) return;
    setBooking(prev => ({
      ...prev,
      duration,
      price: getPriceForDurationAndMode(duration, prev.mode)
    }));
  };

  // Days the therapist has a free slot (from the server). The others show as
  // off; every day used to look bookable until tapped.
  const openDates: string[] | null = Array.isArray(doctorProfile?.openDates) ? doctorProfile!.openDates! : null;
  const isOffDay = (date: string) => !!openDates && !openDates.includes(date);
  const firstOpen = openDates?.[0];
  useEffect(() => {
    // Start on the first day with something to book, not on an empty today.
    if (firstOpen && booking.date && isOffDay(booking.date)) setBooking((prev) => ({ ...prev, date: firstOpen, timeSlot: '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstOpen]);

  const handleDateChange = (date: string) => {
    setBooking(prev => (prev.date === date ? prev : { ...prev, date, timeSlot: '' }));
  };

  const handleTimeSlotChange = (timeSlot: string) => {
    setBooking(prev => ({ ...prev, timeSlot }));
  };

  /** The session is booked: say so, and say what happens next. */
  const finishBooked = (sessionData: any) => {
    clearPendingBooking();
    queryClient.invalidateQueries({ queryKey: ['patient'] }); // every patient list: upcoming, calendar, history
    queryClient.invalidateQueries({ queryKey: ['doctor', 'slots', doctorId] });
    if (isImmediate && sessionData?._id) {
      // The call room is an instant session's confirmation: it shows the
      // request ringing and the therapist's answer.
      toast.success('Payment confirmed — asking your therapist to join.');
      navigate(`/video-call/${sessionData._id}`);
      return;
    }
    setResult({ outcome: 'paid', price: sessionData?.price ?? booking.price ?? 0, date: booking.date, timeSlot: booking.timeSlot, mode: booking.mode, duration: booking.duration });
    setStage('done');
  };

  /**
   * The browser couldn't confirm the payment (the verify request failed, or
   * Razorpay is still capturing it). The webhook or the checkout sweep will
   * settle it on the server, so wait for that here instead of leaving the
   * patient on an error with no booking in sight.
   */
  const waitForConfirmation = (sessionData: any) => {
    setStage('confirming');
    let tries = 0;
    const poll = async () => {
      tries += 1;
      let outcome: 'paid' | 'failed' | 'pending' = 'pending';
      try {
        const res = await fetch(`${API_BASE_URL}/sessions/${sessionData._id}`);
        if (res.ok) outcome = paymentOutcome(await res.json());
      } catch {
        /* keep waiting */
      }
      if (outcome === 'paid') return finishBooked(sessionData);
      if (outcome === 'failed' || tries >= CONFIRM_POLL_TRIES) {
        clearPendingBooking();
        queryClient.invalidateQueries({ queryKey: ['patient'] });
        setResult({ outcome, price: sessionData?.price ?? booking.price ?? 0, date: booking.date, timeSlot: booking.timeSlot, mode: booking.mode, duration: booking.duration });
        setStage('done');
        return;
      }
      pollTimer.current = window.setTimeout(poll, CONFIRM_POLL_MS);
    };
    void poll();
  };

  /** Closing the payment window: give the time back, and say only what is true. */
  const abandonCheckout = async (sessionData: any) => {
    let body: any = null;
    try {
      const res = await fetch(`${API_BASE_URL}/sessions/${sessionData._id}/abandon-checkout`, { method: 'POST' });
      body = res.ok ? await res.json() : null;
    } catch {
      body = null;
    }
    const what = abandonResult(body);
    if (what === 'booked') {
      toast.success('Your payment went through — the session is booked.');
      finishBooked(sessionData);
      return;
    }
    if (what === 'processing') {
      waitForConfirmation(sessionData);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['doctor', 'slots', doctorId] });
    setStage('choose');
    if (what === 'freed') {
      toast(isImmediate ? 'Payment cancelled — nothing was charged.' : 'Payment cancelled — the time is free again.');
    } else {
      toast("Payment cancelled. If you didn't pay, nothing was charged.");
    }
  };

  const openCheckout = (sessionData: any) => {
    const options = {
      // No fallback, deliberately. This used to default to a hardcoded
      // 'rzp_test_TCJDiOL4WcPBxR' — a DIFFERENT key from the one the
      // server creates orders with. Razorpay ties an order to the key that
      // created it, so the fallback did not degrade gracefully: checkout
      // opened and then rejected the payment, which is harder to diagnose
      // than not opening at all.
      key: import.meta.env.VITE_RAZORPAY_KEY_ID,
      amount: Math.round(sessionData.price * 100),
      currency: 'INR',
      name: 'Veraawell',
      description: isImmediate ? 'Instant session' : 'Scheduled session',
      order_id: sessionData.razorpayOrderId,
      handler: async function (response: any) {
        setStage('confirming');
        try {
          // Cryptographic verification. The Bearer fallback and cookies are
          // added by the global fetch wrapper (utils/csrfFetchInterceptor.ts).
          const verifyRes = await fetch(`${API_BASE_URL}/payments/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            })
          });
          const verifyData = await verifyRes.json().catch(() => ({}));
          if (verifyRes.status === 409 && (verifyData.code === 'CHECKOUT_EXPIRED' || verifyData.code === 'DUPLICATE_PAYMENT')) {
            // The server's own words: it says what happened to the money
            // (expired checkout, or this session was already paid for).
            toast.error(verifyData.message || 'This payment could not be applied to the session.', { duration: 8000 });
            queryClient.invalidateQueries({ queryKey: ['patient'] });
            setTimeout(() => navigate('/patient-dashboard'), 1500);
          } else if (verifyRes.ok && verifyData.success) {
            finishBooked(sessionData);
          } else {
            // Not confirmed by the browser — which is not the same as not
            // paid. The webhook confirms it server-side; wait for that.
            waitForConfirmation(sessionData);
          }
        } catch {
          waitForConfirmation(sessionData);
        }
      },
      prefill: {
        name: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
        email: user?.email,
      },
      theme: { color: '#0d9488' },
      modal: {
        // Closing the window gives the slot back straight away (it used
        // to stay held for 20 minutes). The server asks Razorpay first, so
        // a payment that did go through still books the session.
        ondismiss: () => { void abandonCheckout(sessionData); }
      }
    };

    const rzp = new (window as any).Razorpay(options);
    // Razorpay lets the patient retry inside the same window, so a failed
    // attempt is only reported — the window decides when it is over.
    rzp.on('payment.failed', function (response: any) {
      toast.error(`Payment failed: ${response?.error?.description || 'please try again'}. You can try again in the same window.`);
    });
    rzp.open();
  };

  const bookSessionMutation = useMutation({
    mutationFn: async (requestBody: any) => {
      const endpoint = isImmediate
        ? `${API_BASE_URL}/sessions/book-immediate`
        : `${API_BASE_URL}/sessions/book`;

      // Cookies, CSRF and the Bearer fallback come from the global fetch
      // wrapper (utils/csrfFetchInterceptor.ts).
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new BookingError(body.message || 'Booking failed. Please try again.', body.reason, response.status);
      }
      return response.json();
    },
    onSuccess: async (data) => {
      const sessionData = data.session;
      if (sessionData && sessionData.razorpayOrderId) {
        try {
          await loadRazorpay();
        } catch (err) {
          // The order exists and holds the time: give it straight back.
          void fetch(`${API_BASE_URL}/sessions/${sessionData._id}/abandon-checkout`, { method: 'POST' }).catch(() => {});
          queryClient.invalidateQueries({ queryKey: ['doctor', 'slots', doctorId] });
          toast.error((err as Error).message, { duration: 8000 });
          setStage('review');
          return;
        }
        openCheckout(sessionData);
      } else {
        // Nothing to pay (a free booking): it is confirmed already.
        finishBooked(sessionData);
      }
    },
    onError: (err: BookingError) => {
      if (err.reason === 'busy' || err.reason === 'offline') {
        // The therapist went busy or offline between the page loading and
        // paying: offer a time instead of a dead end.
        toast.error(err.message, { duration: 7000 });
        queryClient.invalidateQueries({ queryKey: ['doctors', 'online'] });
        setStage('choose');
        return;
      }
      if (/no longer available|not available|too soon/i.test(err.message)) {
        toast.error(`${err.message} Please pick another time.`, { duration: 7000 });
        setBooking(prev => ({ ...prev, timeSlot: '' }));
        queryClient.invalidateQueries({ queryKey: ['doctor', 'slots', doctorId] });
        setStage('choose');
        return;
      }
      toast.error(err.message || 'Failed to book session. Please try again.');
    }
  });

  /** "Schedule Session" / "Book Now": check the choice, then show the summary. */
  const handleBookNow = () => {
    if (booking.price === null) {
      toast.error('This session length is not offered by this therapist.');
      return;
    }

    if (!isImmediate && (!booking.date || !booking.timeSlot)) {
      toast.error('Please select both date and time slot');
      return;
    }

    if (!isLoggedIn) {
      // Kept for after sign-in (any route — password, new account + code,
      // or Google), so the patient comes back to the same choice.
      if (doctorId) {
        savePendingBooking({
          doctorId, bookingType, serviceType, mode: booking.mode, duration: booking.duration,
          date: booking.date, timeSlot: booking.timeSlot
        });
      }
      toast('Sign in or create an account to book — your choices are saved.');
      navigate('/login', {
        state: {
          from: location.pathname,
          serviceType,
          bookingType,
          message: 'Please sign in to book your session'
        }
      });
      return;
    }

    setStage('review');
  };

  const handlePay = () => {
    const requestBody = {
      doctorId,
      mode: booking.mode,
      duration: booking.duration,
      ...(!isImmediate && {
        sessionDate: booking.date,
        sessionTime: booking.timeSlot,
        sessionType: 'scheduled',
        ...(serviceType && serviceType !== 'General' ? { serviceType } : {})
      })
    };
    bookSessionMutation.mutate(requestBody);
  };

  const isBooking = bookSessionMutation.isPending;

  // Back from sign-in with a choice parked: once the page has what it needs
  // (and, for a time slot, the time is still free), go straight to the summary.
  useEffect(() => {
    if (restored.current || !pending || !isLoggedIn || !doctorProfile || stage !== 'choose') return;
    if (!isImmediate && !slotsQuery.isSuccess) return;
    restored.current = true;
    clearPendingBooking();
    if (booking.price === null) return;
    if (isImmediate || (booking.timeSlot && availableSlots.includes(booking.timeSlot))) {
      setStage('review');
    } else if (!isImmediate && pending.timeSlot) {
      toast('The time you picked was just taken — please choose another.');
    }
  }, [pending, isLoggedIn, doctorProfile, stage, isImmediate, slotsQuery.isSuccess, availableSlots, booking.timeSlot, booking.price]);

  // The summary closes with Escape, like any dialog.
  useEffect(() => {
    if (stage !== 'review') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isBooking) setStage('choose'); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage, isBooking]);

  // Bring the confirmation into view when it replaces the booking form.
  useEffect(() => {
    if (stage === 'confirming' || stage === 'done') {
      document.getElementById('booking-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [stage]);

  // Show loading state
  if (loading) {
    return (
      <div className="bg-white min-h-[100dvh] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-2 border-teal-600 mb-4"></div>
          <p className="text-xl text-gray-600" style={{ fontFamily: 'Bree Serif, serif' }}>Loading doctor profile...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error || !doctorProfile) {
    return (
      <div className="bg-white min-h-[100dvh] flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-red-600 mb-4" style={{ fontFamily: 'Bree Serif, serif' }}>{error || 'Doctor not found'}</p>
          <button
            onClick={() => navigate('/choose-professional')}
            className="px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
            style={{ fontFamily: 'Bree Serif, serif' }}
          >
            Back to Professionals
          </button>
        </div>
      </div>
    );
  }

  // Extract doctor data with fallbacks
  const displayName = doctorDisplayName(doctorProfile.userId.firstName, doctorProfile.userId.lastName);
  const experienceText = experienceLabel(doctorProfile.experience);
  const specializationText = doctorProfile.specialization.join(', ');
  const languagesText = doctorProfile.languages.join(', ');
  const rating = doctorProfile.rating.average;
  const hasRating = doctorProfile.rating.totalReviews > 0;
  const fullStars = hasRating ? Math.round(rating) : 0;
  const fromPrice = startingPrice(doctorProfile.pricing);
  const photo = !photoFailed && doctorProfile.profileImage ? doctorProfile.profileImage : null;

  /** "Tue 21 Oct, 10:00 AM IST" for the chosen slot. */
  const slotWhen = (date: string, timeSlot: string) => {
    const start = resolveSessionStart({ sessionDate: date, sessionTime: timeSlot });
    return Number.isNaN(start.getTime())
      ? `${date}, ${timeSlot} IST`
      : `${formatSessionDay(start, { weekday: 'short', day: 'numeric', month: 'short' })}, ${timeSlot} IST`;
  };

  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const doctorColor = getDoctorAccentColor(doctorProfile.userId._id);
  const lightBgColor = hexToRgba(doctorColor, 0.15); // 15% opacity for background sections

  // Shared pill styling for the booking section — solid fill when selected,
  // soft tint (with a slightly deeper tint on hover) when not. Also strips the
  // default browser/mobile tap-highlight and focus outline these buttons got.
  const pillBase: React.CSSProperties = {
    border: 'none',
    outline: 'none',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  };
  const pillStyle = (active: boolean): React.CSSProperties => ({
    ...pillBase,
    ...(active
      ? { backgroundColor: doctorColor, color: '#fff', boxShadow: `0 4px 12px ${doctorColor}40` }
      : { backgroundColor: `${doctorColor}12`, color: doctorColor }),
  });
  const videoOffered = offeredDurations(doctorProfile.pricing, 'video').length > 0;
  const voiceOffered = offeredDurations(doctorProfile.pricing, 'voice').length > 0;

  const pillHoverHandlers = (active: boolean) => (
    active ? {} : {
      onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.backgroundColor = `${doctorColor}22`; },
      onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.backgroundColor = `${doctorColor}12`; },
    }
  );

  return (
    <div className="bg-white min-h-[100dvh] pt-16 md:pt-[80px] overflow-x-clip">
      <Helmet>
        <title>{`${displayName} - ${specializationText} | Veraawell`}</title>
        <meta name="description" content={`Book a session with ${displayName}.${experienceText ? ` ${experienceText} of experience` : ''}${specializationText ? ` in ${specializationText}` : ''}.`} />
        <meta property="og:title" content={`${displayName} | Veraawell`} />
        <meta property="og:description" content={`Book a session with ${displayName}.`} />
        {doctorProfile.profileImage && <meta property="og:image" content={doctorProfile.profileImage} />}
        {/* The page's own address, which takes the doctor's user id; the
            profile's id here pointed search engines at "Doctor not found". */}
        <link rel="canonical" href={`https://veraawell.com/doctor/${doctorId}`} />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Physician",
                "name": displayName,
                ...(doctorProfile.profileImage ? { "image": doctorProfile.profileImage } : {}),
                "description": doctorProfile.bio || `Specializes in ${specializationText}`,
                "medicalSpecialty": doctorProfile.specialization.length > 0 ? doctorProfile.specialization[0] : "General Practice",
                // Only real ratings: a doctor with none was published as
                // "5 stars from 1 review".
                ...(doctorProfile.rating?.totalReviews ? {
                  "aggregateRating": {
                    "@type": "AggregateRating",
                    "ratingValue": rating,
                    "reviewCount": doctorProfile.rating.totalReviews
                  }
                } : {}),
                ...(fromPrice ? { "priceRange": `From ${formatINR(fromPrice)}` } : {})
              },
              {
                "@type": "FAQPage",
                "mainEntity": [
                  {
                    "@type": "Question",
                    "name": "What should I expect in my first session?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text": "Your first session is primarily about getting to know each other. It's a safe space to discuss your background, the challenges you're currently facing, and what you hope to achieve through therapy. It's also an opportunity to see if you're a good fit for working together."
                    }
                  },
                  {
                    "@type": "Question",
                    "name": "How do I join the video or voice call?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text": "Once you book an appointment, you'll receive a confirmation email. At the time of your appointment, simply log in to your Veraawell dashboard and click 'Join Session' to enter the secure, encrypted call environment."
                    }
                  },
                  {
                    "@type": "Question",
                    "name": "What is the cancellation policy?",
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text": "Cancel more than 4 hours before the start, from your dashboard, and you get a full refund. Cancellations inside 4 hours, and missed sessions, are not refunded — your therapist's time was reserved for you. To change the time, cancel and book a new slot."
                    }
                  }
                ]
              }
            ]
          })}
        </script>
      </Helmet>
      {/* Hero Section with Background */}
      <div className="relative h-48 sm:h-56 md:h-64 lg:h-72 xl:h-80 overflow-hidden">
        <img
          src={doctorProfile.bannerImage || "/profile-bg.svg"}
          alt="Veraawell clinic background"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-opacity-30"></div>
      </div>

      {/* Profile Details Section */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 mb-12">
        
        {/* Profile Picture (Overlaps Banner) */}
        <div className="flex flex-col md:flex-row gap-6 md:gap-10">
          <div className="-mt-16 sm:-mt-20 md:-mt-24 shrink-0 relative z-20">
            <div 
              className="w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 rounded-full overflow-hidden bg-white border-4 sm:border-[6px] border-white shadow-md mx-auto md:mx-0"
            >
              {/* Their own photo, or their initials — never a broken image
                  or a stock face. */}
              {photo ? (
                <img
                  src={photo}
                  alt={displayName}
                  className="w-full h-full object-cover"
                  onError={() => setPhotoFailed(true)}
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-white text-4xl sm:text-5xl font-bold"
                  style={{ background: doctorColor }}
                  aria-label={displayName}
                  role="img"
                >
                  {doctorInitials(doctorProfile.userId.firstName, doctorProfile.userId.lastName)}
                </div>
              )}
            </div>
          </div>

          {/* Profile Info */}
          <div className="flex-1 w-full text-center md:text-left mt-2 md:mt-6">
            <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {displayName}
                </h1>
                <div className="flex items-center justify-center md:justify-start gap-1.5 mt-1.5" aria-label={hasRating ? `Rated ${rating.toFixed(1)} out of 5 from ${doctorProfile.rating.totalReviews} reviews` : 'No ratings yet'}>
                  <div className="flex text-yellow-400">
                    {[...Array(5)].map((_, i) => (
                      <svg
                        key={i}
                        className={`w-4 h-4 sm:w-5 sm:h-5 ${i < fullStars ? 'fill-current' : 'fill-gray-200'}`}
                        viewBox="0 0 20 20"
                      >
                        <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                      </svg>
                    ))}
                  </div>
                  {/* Same as the directory card: one decimal and the count, or
                      "New" — not "0.00" under five grey stars. */}
                  <span className="text-gray-600 font-medium text-sm sm:text-base ml-1">
                    {hasRating ? `${rating.toFixed(1)} (${doctorProfile.rating.totalReviews})` : 'New'}
                  </span>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center justify-center md:justify-end gap-3 mt-4 md:mt-0">
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    toast.success('Profile link copied!');
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-full border border-gray-200 bg-white text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-all shadow-sm outline-none"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Share
                </button>
                <button 
                  onClick={() => {
                    document.getElementById('booking-section')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="flex items-center gap-2 px-6 py-2 rounded-full text-white font-semibold text-sm transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5 outline-none"
                  style={{ backgroundColor: doctorColor, WebkitTapHighlightColor: 'transparent' }}
                >
                  Book Appointment
                </button>
              </div>
            </div>

            {/* Clean Info Layout */}
            <div className="flex flex-col gap-6 mt-8">
              <div className="flex flex-col sm:flex-row sm:items-start gap-6 sm:gap-16">
                {experienceText && (
                  <div>
                    <h3 className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-1.5">Experience</h3>
                    <p className="text-gray-800 font-semibold text-base">{experienceText}</p>
                  </div>
                )}

                <div>
                  <h3 className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-1.5">Languages</h3>
                  <p className="text-gray-800 font-semibold text-base">{languagesText}</p>
                </div>
              </div>

              <div>
                <h3 className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-1.5">Qualifications</h3>
                <p className="text-gray-800 font-semibold text-base">
                  {doctorProfile.qualification.join(' • ')}
                </p>
              </div>

              <div>
                <h3 className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-2.5">Specializations</h3>
                <div className="flex flex-wrap justify-center md:justify-start gap-2">
                  {doctorProfile.specialization.map((spec, idx) => (
                    <span 
                      key={idx} 
                      className="px-4 py-1.5 rounded-full text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors cursor-default"
                    >
                      {spec}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Color-themed section group — decorative blobs give the glass panels below something to frost ── */}
      <div className="relative overflow-hidden">
        <div
          className="absolute -top-20 -left-20 w-[420px] h-[420px] rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${doctorColor}30, transparent 70%)`, filter: 'blur(70px)' }}
        />
        <div
          className="absolute top-1/3 -right-24 w-[380px] h-[380px] rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${doctorColor}28, transparent 70%)`, filter: 'blur(80px)' }}
        />
        <div
          className="absolute bottom-0 left-1/3 w-[320px] h-[320px] rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${doctorColor}20, transparent 70%)`, filter: 'blur(70px)' }}
        />

      {/* Quote and About Section */}
      <div
        className="mt-12 md:mt-16 py-10 md:py-16 px-4 relative"
        style={{
          background: `linear-gradient(135deg, ${doctorColor}16, ${doctorColor}05)`,
          backdropFilter: 'blur(20px) saturate(120%)',
          WebkitBackdropFilter: 'blur(20px) saturate(120%)',
          borderTop: `1px solid ${doctorColor}22`,
          borderBottom: `1px solid ${doctorColor}22`,
        }}
      >
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-8 md:mb-10">
            <h2 className="text-2xl sm:text-3xl font-semibold italic leading-snug" style={{ color: doctorColor }}>
              "{doctorProfile.quote || 'Healing takes time, and asking for help is a courageous first step.'}"
            </h2>
            <p className="mt-4 text-gray-500 font-medium">
              — {doctorProfile.quote ? doctorProfile.quoteAuthor || 'Professional Philosophy' : 'Veraawell Philosophy'}
            </p>
          </div>
          
          <div className="text-gray-600 text-base sm:text-lg leading-relaxed space-y-4 max-w-3xl mx-auto">
            {doctorProfile.bio && doctorProfile.bio !== 'Profile not completed yet' ? (
              <p>{doctorProfile.bio}</p>
            ) : doctorProfile.specialization?.length > 0 ? (
              // Only what the therapist told us. This used to be a paragraph
              // of invented beliefs and methods presented as theirs.
              <p>
                {displayName} works with {specializationText}{languagesText ? `, in ${languagesText}` : ''}.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Booking Section */}
      <div id="booking-section" className="py-12 md:py-16 px-4 relative">
        <div className="max-w-6xl mx-auto">
          {/* A therapist who can't be booked this way (no approved payout,
              no price, or — for a time slot — no open dates) gets a notice
              instead of a booking form that would only fail at checkout. */}
          {stage === 'confirming' ? (
            <div role="status" aria-live="polite" className="max-w-xl mx-auto text-center rounded-[20px] p-8" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 mb-4" style={{ borderColor: doctorColor }} />
              <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--text)' }}>Confirming your payment…</h3>
              <p className="text-sm" style={{ color: 'var(--text-2)' }}>This usually takes a few seconds. Please keep this page open.</p>
            </div>
          ) : stage === 'done' && result ? (
            <div role="status" aria-live="polite" className="max-w-xl mx-auto rounded-[20px] p-7 sm:p-8" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 12px 36px rgba(27,43,46,.08)' }}>
              {result.outcome === 'paid' ? (
                <>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: '#10B981' }}>
                    <FiCheck size={24} style={{ color: '#fff' }} strokeWidth={3} />
                  </div>
                  <h3 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text)' }}>You're booked</h3>
                  <p className="text-sm mb-5" style={{ color: 'var(--text-2)' }}>We've emailed you the details.</p>
                  <dl className="space-y-2.5 text-sm mb-5">
                    <div className="flex justify-between gap-4"><dt style={{ color: 'var(--text-2)' }}>Therapist</dt><dd className="font-semibold text-right" style={{ color: 'var(--text)' }}>{displayName}</dd></div>
                    <div className="flex justify-between gap-4"><dt style={{ color: 'var(--text-2)' }}>When</dt><dd className="font-semibold text-right" style={{ color: 'var(--text)' }}>{slotWhen(result.date, result.timeSlot)}</dd></div>
                    <div className="flex justify-between gap-4"><dt style={{ color: 'var(--text-2)' }}>Session</dt><dd className="font-semibold text-right" style={{ color: 'var(--text)' }}>{result.duration} min · {result.mode === 'voice' ? 'Voice call' : 'Video call'}</dd></div>
                    <div className="flex justify-between gap-4"><dt style={{ color: 'var(--text-2)' }}>Paid</dt><dd className="font-semibold text-right" style={{ color: 'var(--text)' }}>{formatINR(result.price)}</dd></div>
                  </dl>
                  <div className="rounded-xl p-4 mb-6 flex gap-3 text-sm" style={{ background: `${doctorColor}10`, color: 'var(--text)' }}>
                    <FiClock size={18} className="shrink-0 mt-0.5" style={{ color: doctorColor }} />
                    <p>
                      To join, open your dashboard at the time — the <strong>Join</strong> button appears 15 minutes before the start.
                      Need to cancel? Do it more than 4 hours before for a full refund.
                    </p>
                  </div>
                </>
              ) : result.outcome === 'pending' ? (
                <>
                  <h3 className="text-2xl font-semibold mb-2" style={{ color: 'var(--text)' }}>We're still confirming your payment</h3>
                  <p className="text-sm mb-6" style={{ color: 'var(--text-2)' }}>
                    It can take a few minutes. Your session will appear on your dashboard as soon as it's confirmed, and we'll email you.
                    If the payment doesn't go through, any money taken is refunded automatically.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-2xl font-semibold mb-2" style={{ color: 'var(--text)' }}>This booking didn't go through</h3>
                  <p className="text-sm mb-6" style={{ color: 'var(--text-2)' }}>
                    If money left your account, it is refunded automatically (usually within 5–7 working days). You can pick a time again.
                  </p>
                </>
              )}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => navigate('/patient-dashboard')}
                  className="flex-1 py-3 rounded-full text-sm font-semibold text-white"
                  style={{ background: doctorColor }}
                >
                  Go to my dashboard
                </button>
                {result.outcome === 'failed' && (
                  <button
                    onClick={() => { setResult(null); setStage('choose'); queryClient.invalidateQueries({ queryKey: ['doctor', 'slots', doctorId] }); }}
                    className="flex-1 py-3 rounded-full text-sm font-semibold"
                    style={{ border: `1.5px solid ${doctorColor}`, color: doctorColor }}
                  >
                    Choose another time
                  </button>
                )}
              </div>
            </div>
          ) : !canBookHere ? (
            <div role="status" className="max-w-xl mx-auto text-center rounded-[20px] p-8" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--text)' }}>This therapist isn't taking bookings right now</h3>
              <p className="text-sm mb-5" style={{ color: 'var(--text-2)' }}>
                {isImmediate ? 'They can\'t take an instant session at the moment.' : 'They have no open dates at the moment.'} You can choose another therapist.
              </p>
              <button
                onClick={() => navigate('/choose-professional', { state: { bookingType: 'later' } })}
                className="px-6 py-2.5 rounded-full text-sm font-semibold text-white"
                style={{ background: 'var(--teal)' }}
              >
                See other therapists
              </button>
            </div>
          ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Card */}
            <div
              className="rounded-[20px] p-6 md:p-7 transition-shadow duration-300 relative overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${doctorColor}12, ${doctorColor}03)`,
                backdropFilter: 'blur(20px) saturate(120%)',
                WebkitBackdropFilter: 'blur(20px) saturate(120%)',
                border: `1px solid ${doctorColor}25`,
                boxShadow: '0 12px 36px rgba(27,43,46,.08), inset 0 1px 0 rgba(255,255,255,.6)',
              }}
            >
              <div className="space-y-6 relative z-10">
                {/* Select Mode */}
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center">
                  <h3 className="font-bold text-base sm:text-lg w-auto sm:w-36 shrink-0" style={{ color: 'var(--text)' }}>Select Mode:</h3>
                  <div className="flex flex-nowrap gap-2 w-full overflow-x-auto pb-1">
                    <button
                      onClick={() => handleModeChange('video')}
                      disabled={!videoOffered}
                      title={videoOffered ? undefined : 'Not offered by this therapist'}
                      className="flex items-center gap-2 font-semibold py-1.5 px-4 sm:py-2 sm:px-5 rounded-full transition-all duration-300 whitespace-nowrap text-sm sm:text-base disabled:opacity-40 disabled:cursor-not-allowed"
                      style={pillStyle(booking.mode === 'video')}
                      {...(videoOffered ? pillHoverHandlers(booking.mode === 'video') : {})}
                    >
                      <FiVideo size={15} />
                      Video Call
                    </button>
                    <button
                      onClick={() => handleModeChange('voice')}
                      disabled={!voiceOffered}
                      title={voiceOffered ? undefined : 'Not offered by this therapist'}
                      className="flex items-center gap-2 font-semibold py-1.5 px-4 sm:py-2 sm:px-5 rounded-full transition-all duration-300 whitespace-nowrap text-sm sm:text-base disabled:opacity-40 disabled:cursor-not-allowed"
                      style={pillStyle(booking.mode === 'voice')}
                      {...(voiceOffered ? pillHoverHandlers(booking.mode === 'voice') : {})}
                    >
                      <FiPhone size={15} />
                      Voice Call
                    </button>
                  </div>
                </div>

                {/* Select Duration — each pill is clickable and shows its own price, so there's no separate read-only price row to keep in sync */}
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center">
                  <h3 className="font-bold text-base sm:text-lg w-auto sm:w-36 shrink-0" style={{ color: 'var(--text)' }}>Select Duration:</h3>
                  <div className="flex flex-nowrap gap-2 w-full overflow-x-auto pb-1">
                    {/* Only the lengths this doctor actually prices in this mode. */}
                    {offeredDurations(doctorProfile.pricing, booking.mode).map((dur) => (
                      <button
                        key={dur}
                        onClick={() => handleDurationChange(dur)}
                        className="font-semibold py-1.5 px-3 sm:py-2 sm:px-4 rounded-2xl transition-all duration-300 flex flex-col items-center min-w-[75px] sm:min-w-[90px] whitespace-nowrap"
                        style={pillStyle(booking.duration === dur)}
                        {...pillHoverHandlers(booking.duration === dur)}
                      >
                        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider opacity-80 mb-0.5">{dur} Mins</span>
                        <span className="text-xs sm:text-sm">{formatINR(getPriceForDurationAndMode(dur, booking.mode))}</span>
                      </button>
                    ))}
                    {offeredDurations(doctorProfile.pricing, booking.mode).length === 0 && (
                      <p className="text-sm italic" style={{ color: 'var(--text-2)' }}>
                        This therapist hasn't set prices for {booking.mode} sessions yet.
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-6 mt-8 border-t" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-sm font-medium leading-relaxed" style={{ color: 'var(--text-2)' }}>
                    <span className="font-bold" style={{ color: 'var(--text)' }}>Not sure which length?</span> A 20-minute session is a good way to get to know a therapist and talk about what you'd like help with.
                  </p>
                </div>
              </div>
            </div>

            {/* Right Card */}
            <div
              className="rounded-[20px] p-6 md:p-7 transition-shadow duration-300 relative overflow-hidden flex flex-col justify-between"
              style={{
                background: `linear-gradient(135deg, ${doctorColor}12, ${doctorColor}03)`,
                backdropFilter: 'blur(20px) saturate(120%)',
                WebkitBackdropFilter: 'blur(20px) saturate(120%)',
                border: `1px solid ${doctorColor}25`,
                boxShadow: '0 12px 36px rgba(27,43,46,.08), inset 0 1px 0 rgba(255,255,255,.6)',
              }}
            >
              <div className="space-y-6 relative z-10 flex-1 flex flex-col justify-center">
                {canChooseHow && (
                  <div
                    role="radiogroup"
                    aria-label="When would you like your session?"
                    className="grid grid-cols-2 gap-1 p-1 rounded-full"
                    style={{ background: 'rgba(255,255,255,.7)', border: `1px solid ${doctorColor}25` }}
                  >
                    {([['immediate', 'Talk now'], ['scheduled', 'Book a time']] as const).map(([value, label]) => {
                      const selected = bookingType === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setBookingType(value)}
                          className="py-2 rounded-full text-sm font-semibold transition-colors"
                          style={selected ? { background: doctorColor, color: '#fff' } : { color: 'var(--text-2)' }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
                {/* Immediate booking: show instant session card. Scheduled: show date + slot picker. */}
                {isImmediate && (instantStatus === 'busy' || instantStatus === 'offline') ? (
                  // Not answerable right now: say why, and offer a time instead
                  // of a checkout the server would refuse.
                  <div className="text-center py-2" role="status">
                    <h3 className="text-[22px] font-bold mb-2.5 tracking-tight" style={{ color: 'var(--text)' }}>
                      {instantStatus === 'busy' ? `${displayName} is in a session right now` : `${displayName} isn't online right now`}
                    </h3>
                    <p className="text-sm leading-relaxed max-w-xs mx-auto mb-5" style={{ color: 'var(--text-2)' }}>
                      {doctorProfile.bookable !== false
                        ? 'You can book a time with them instead, or choose another therapist who is online.'
                        : 'Please choose another therapist who is online.'}
                    </p>
                    <div className="flex flex-col gap-2 max-w-xs mx-auto">
                      {doctorProfile.bookable !== false && (
                        <button
                          onClick={() => setBookingType('scheduled')}
                          className="py-2.5 rounded-full text-sm font-semibold text-white"
                          style={{ background: doctorColor }}
                        >
                          Book a time instead
                        </button>
                      )}
                      <button
                        onClick={() => navigate('/choose-professional', { state: { bookingType: 'now' } })}
                        className="py-2.5 rounded-full text-sm font-semibold"
                        style={{ border: `1.5px solid ${doctorColor}`, color: doctorColor }}
                      >
                        See who's online
                      </button>
                    </div>
                  </div>
                ) : isImmediate ? (
                  <div className="text-center py-2">
                    {/* Icon */}
                    <div className="relative inline-flex mb-6">
                      <div
                        className="w-20 h-20 rounded-[22px] flex items-center justify-center"
                        style={{
                          background: `linear-gradient(135deg, ${doctorColor}, ${doctorColor}CC)`,
                          boxShadow: `0 12px 28px -8px ${doctorColor}80`,
                        }}
                      >
                        <FiRadio size={30} style={{ color: '#fff' }} />
                      </div>
                      {/* Online checkmark badge */}
                      <span
                        className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ background: '#10B981', border: '3px solid var(--surface)' }}
                      >
                        <FiCheck size={13} style={{ color: '#fff' }} strokeWidth={3} />
                      </span>
                    </div>

                    <h3 className="text-[26px] font-bold mb-2.5 tracking-tight" style={{ color: 'var(--text)' }}>Instant Session</h3>
                    <p className="text-sm leading-relaxed max-w-xs mx-auto" style={{ color: 'var(--text-2)' }}>
                      {displayName} is online now. After you pay, they have 2 minutes to accept — if they don't, you get a full refund automatically.
                    </p>
                  </div>
                ) : (
                  /* Scheduled booking — 14-day date strip + slot grid */
                  <div className="space-y-6">
                    {/* Select Date */}
                    <div>
                      <h3 className="font-bold text-lg mb-4" style={{ color: 'var(--text)' }}>Select Date:</h3>
                      <div
                        className="flex space-x-3 overflow-x-auto pb-2 scrollbar-hide"
                        style={{ WebkitOverflowScrolling: 'touch' }}
                      >
                        {availableDates.map((dateObj) => (
                          <button
                            key={dateObj.date}
                            onClick={() => handleDateChange(dateObj.date)}
                            className="font-semibold py-2.5 px-3 rounded-2xl text-center flex-shrink-0 transition-all duration-300 flex flex-col items-center min-w-[56px]"
                            style={{ ...pillStyle(booking.date === dateObj.date), ...(isOffDay(dateObj.date) && booking.date !== dateObj.date ? { opacity: 0.45 } : {}) }}
                            {...pillHoverHandlers(booking.date === dateObj.date)}
                            aria-label={`${dateObj.weekday} ${dateObj.dayNum} ${dateObj.monthName}${isOffDay(dateObj.date) ? ' (no free times)' : ''}`}
                          >
                            <span className="text-[10px] font-bold uppercase opacity-80 mb-1">{dateObj.weekday.toUpperCase()}</span>
                            <span className="text-2xl font-bold leading-none mb-1">{dateObj.dayNum}</span>
                            <span className="text-[10px] font-medium opacity-80">{isOffDay(dateObj.date) ? 'Off' : dateObj.monthName}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Select Slot */}
                    <div>
                      <h3 className="font-bold text-lg mb-4" style={{ color: 'var(--text)' }}>
                        Select Slot: <span className="text-sm font-semibold" style={{ color: 'var(--text-2)' }}>(times in IST)</span>
                      </h3>
                      <div className="flex flex-wrap gap-3">
                        {slotsQuery.isLoading ? (
                          <p className="text-sm p-4" style={{ color: 'var(--text-2)' }}>Loading times…</p>
                        ) : slotsQuery.isError ? (
                          <p className="text-sm p-4 rounded-xl" role="alert" style={{ color: 'var(--text-2)', background: `${doctorColor}0d` }}>
                            Couldn't load the times.{' '}
                            <button className="underline font-semibold" style={{ color: doctorColor }} onClick={() => slotsQuery.refetch()}>Try again</button>
                          </p>
                        ) : availableSlots.length > 0 ? availableSlots.map((slot) => (
                          <button
                            key={slot}
                            onClick={() => handleTimeSlotChange(slot)}
                            className="font-semibold py-2 px-6 rounded-full transition-all duration-300"
                            style={pillStyle(booking.timeSlot === slot)}
                            {...pillHoverHandlers(booking.timeSlot === slot)}
                            aria-pressed={booking.timeSlot === slot}
                          >
                            {slot}
                          </button>
                        )) : (
                          <p className="italic text-sm p-4 rounded-xl" style={{ color: 'var(--text-2)', background: `${doctorColor}0d` }}>
                            {!booking.date
                              ? 'Select a date to see slots'
                              : booking.date === availableDates[0]?.date
                                ? 'No more slots today — try another date'
                                : 'No available slots for this date'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Book Button */}
              <div className="mt-6 relative z-10 w-full">
                {(() => {
                  const bookDisabled = booking.price === null
                    || (isImmediate
                      ? (isBooking || instantStatus === 'busy' || instantStatus === 'offline')
                      : (isBooking || !booking.date || !booking.timeSlot));
                  return (
                    <button
                      onClick={handleBookNow}
                      disabled={bookDisabled}
                      className={`${bookDisabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'} font-semibold py-3 px-8 rounded-full text-sm transition-all duration-300 w-full`}
                      style={
                        isImmediate
                          ? {
                              border: 'none',
                              color: '#fff',
                              background: `linear-gradient(135deg, ${doctorColor}, ${doctorColor}CC)`,
                              boxShadow: `0 10px 24px -8px ${doctorColor}80`,
                              outline: 'none',
                              WebkitTapHighlightColor: 'transparent',
                            }
                          : {
                              border: `1.5px solid ${doctorColor}`,
                              color: doctorColor,
                              background: 'transparent',
                              outline: 'none',
                              WebkitTapHighlightColor: 'transparent',
                            }
                      }
                      onMouseEnter={(e) => {
                        if (bookDisabled || isImmediate) return;
                        e.currentTarget.style.background = doctorColor;
                        e.currentTarget.style.color = '#fff';
                      }}
                      onMouseLeave={(e) => {
                        if (isImmediate) return;
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = doctorColor;
                      }}
                    >
                      {isBooking ? 'Booking...' : isImmediate ? 'Book Now' : 'Schedule Session'}
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Reviews Section */}
      <div
        className="py-12 md:py-16 relative"
        style={{
          background: `linear-gradient(135deg, ${doctorColor}14, ${doctorColor}04)`,
          backdropFilter: 'blur(20px) saturate(120%)',
          WebkitBackdropFilter: 'blur(20px) saturate(120%)',
          borderTop: `1px solid ${doctorColor}22`,
        }}
      >
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold mb-8 text-center" style={{ color: doctorColor }}>
            Patient Reviews
          </h2>

          {reviewsLoading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
              <p className="text-gray-600 mt-4">Loading reviews...</p>
            </div>
          ) : doctorReviews.length > 0 ? (
            <div 
              className="flex overflow-x-auto space-x-6 sm:space-x-8 pb-4"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {doctorReviews.map((review) => (
                <div key={review._id} className="bg-white p-6 rounded-lg shadow-md flex-shrink-0 w-[85vw] sm:w-80">
                  {/* Reviews are anonymous: a therapy patient's name — even a
                      first name and initial — is not published. */}
                  <h3 className="text-lg font-bold mb-2" style={{ color: doctorColor }}>
                    Verified patient
                  </h3>
                  <div className="flex text-yellow-500 mb-4" aria-label={`${review.rating} out of 5 stars`}>
                    {[...Array(5)].map((_, i) => (
                      <svg
                        key={i}
                        className={`w-6 h-6 ${i < review.rating ? 'fill-current' : 'fill-gray-300'}`}
                        viewBox="0 0 20 20"
                      >
                        <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                      </svg>
                    ))}
                  </div>
                  {/* A star-only rating has no text — older ones carry the
                      filler "No additional comments provided." */}
                  {review.feedback && review.feedback.trim() && review.feedback.trim() !== 'No additional comments provided.' && (
                    <p className="text-gray-600 italic leading-relaxed">
                      "{review.feedback}"
                    </p>
                  )}
                  {review.positives && (
                    <p className="text-green-600 text-sm mt-3">
                      <strong>Positives:</strong> {review.positives}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p className="text-lg">No reviews yet for this doctor.</p>
              <p className="text-sm mt-2">Be the first to share your experience!</p>
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Booking summary — what is being bought, before Razorpay opens. The
          patient used to go from "Schedule Session" straight into a payment
          window that showed only an amount. */}
      {stage === 'review' && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4"
          style={{ background: 'rgba(22,38,42,.45)', backdropFilter: 'blur(4px)' }}
          onClick={() => { if (!isBooking) setStage('choose'); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-summary-title"
            className="w-full sm:max-w-md bg-white rounded-t-[24px] sm:rounded-[24px] p-6 sm:p-7 max-h-[90dvh] overflow-y-auto"
            style={{ boxShadow: '0 20px 60px rgba(27,43,46,.22)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="booking-summary-title" className="text-xl font-semibold mb-4" style={{ color: 'var(--text)' }}>
              Review your booking
            </h2>
            <dl className="space-y-2.5 text-sm mb-5">
              <div className="flex justify-between gap-4"><dt style={{ color: 'var(--text-2)' }}>Therapist</dt><dd className="font-semibold text-right" style={{ color: 'var(--text)' }}>{displayName}</dd></div>
              <div className="flex justify-between gap-4">
                <dt style={{ color: 'var(--text-2)' }}>When</dt>
                <dd className="font-semibold text-right" style={{ color: 'var(--text)' }}>
                  {isImmediate ? 'Now — instant session' : slotWhen(booking.date, booking.timeSlot)}
                </dd>
              </div>
              <div className="flex justify-between gap-4"><dt style={{ color: 'var(--text-2)' }}>Session</dt><dd className="font-semibold text-right" style={{ color: 'var(--text)' }}>{booking.duration} min · {booking.mode === 'voice' ? 'Voice call' : 'Video call'}</dd></div>
              <div className="flex justify-between gap-4 pt-2.5" style={{ borderTop: '1px solid var(--border)' }}>
                <dt className="font-semibold" style={{ color: 'var(--text)' }}>Total</dt>
                <dd className="font-bold text-right text-base" style={{ color: 'var(--text)' }}>{formatINR(booking.price)}</dd>
              </div>
            </dl>
            <p className="text-xs leading-relaxed mb-6" style={{ color: 'var(--text-2)' }}>
              {isImmediate
                ? `After you pay, ${displayName} has 2 minutes to accept. If they don't, you get a full refund automatically.`
                : 'You can join from 15 minutes before the start, from your dashboard. Cancel more than 4 hours before for a full refund; later cancellations aren\'t refunded.'}
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <button
                onClick={() => setStage('choose')}
                disabled={isBooking}
                className="flex-1 py-3 rounded-full text-sm font-semibold disabled:opacity-50"
                style={{ border: '1.5px solid var(--border)', color: 'var(--text)' }}
              >
                Back
              </button>
              <button
                autoFocus
                onClick={handlePay}
                disabled={isBooking || booking.price === null}
                className="flex-1 py-3 rounded-full text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: doctorColor }}
              >
                {isBooking ? 'Opening payment…' : `Pay ${formatINR(booking.price)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAQ Accordion Section */}
      <div className="max-w-3xl mx-auto px-4 py-20 mb-10">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
            Frequently Asked Questions
          </h2>
          <p className="text-gray-500 mt-3 text-sm sm:text-base">Everything you need to know about booking and therapy sessions.</p>
        </div>
        <div className="space-y-4">
          {[
            {
              q: "What should I expect in my first session?",
              a: "Your first session is primarily about getting to know each other. It's a safe space to discuss your background, the challenges you're currently facing, and what you hope to achieve through therapy. It's also an opportunity to see if you're a good fit for working together."
            },
            {
              q: "How do I join the video or voice call?",
              a: "Once you book an appointment, you'll receive a confirmation email. At the time of your appointment, simply log in to your Veraawell dashboard and click \"Join Session\" to enter the secure, encrypted call environment."
            },
            {
              q: "What is the cancellation policy?",
              a: "Cancel more than 4 hours before the start, from your dashboard, and you get a full refund. Cancellations inside 4 hours, and missed sessions, are not refunded — your therapist's time was reserved for you. To change the time, cancel and book a new slot."
            }
          ].map((faq, idx) => (
            <div 
              key={idx} 
              className={`border transition-all duration-300 rounded-2xl overflow-hidden ${openFaq === idx ? 'border-teal-500/30 bg-teal-50/30 shadow-sm' : 'border-gray-100 bg-white hover:border-gray-200'}`}
            >
              <button
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="w-full flex items-center justify-between p-5 text-left focus:outline-none"
              >
                <span className={`font-semibold text-[15px] ${openFaq === idx ? 'text-teal-900' : 'text-gray-800'}`}>
                  {faq.q}
                </span>
                <div className={`ml-4 shrink-0 transition-transform duration-300 ${openFaq === idx ? 'rotate-180 text-teal-600' : 'text-gray-400'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </button>
              <div 
                className={`transition-all duration-300 ease-in-out ${openFaq === idx ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'}`}
              >
                <div className="px-5 pb-5 text-gray-600 text-sm leading-relaxed">
                  {faq.a}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DoctorProfilePage;
