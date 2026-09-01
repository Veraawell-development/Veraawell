import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiEdit2, FiCheck, FiX, FiClock, FiCalendar, FiUser, FiSun, FiMoon } from 'react-icons/fi';
import { Toaster, toast } from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config/api';
import { getAuthToken } from '../utils/authToken';
import { isToday, parseTime } from '../utils/dateUtils';

interface TimeSlot { time: string; isBooked: boolean; sessionId?: string; }
interface DayAvailability { date: string; slots: TimeSlot[]; }
interface UpcomingSession {
  _id: string;
  patientId: { firstName: string; lastName: string; email: string };
  sessionDate: string;
  sessionTime: string;
  status: string;
  paymentStatus: string;
  paymentId?: string;
  price: number;
  sessionType: string;
}

const AM_SLOTS = ['09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM'];
const PM_SLOTS = ['01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM', '08:00 PM'];
const ALL_SLOTS = [...AM_SLOTS, ...PM_SLOTS];

const ManageCalendar: React.FC = () => {
  const navigate = useNavigate();
  const [availabilityType, setAvailabilityType] = useState<'same_slots' | 'different_slots'>('same_slots');
  const [isEditing, setIsEditing] = useState(false);
  const [activeDates, setActiveDates] = useState<string[]>([]);
  const [defaultSlots, setDefaultSlots] = useState<string[]>([]);
  const [customAvailability, setCustomAvailability] = useState<DayAvailability[]>([]);
  const [currentViewDate, setCurrentViewDate] = useState<string>('');
  const [upcomingSessions, setUpcomingSessions] = useState<UpcomingSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<UpcomingSession | null>(null);
  const getNextDays = (count: number) => {
    const today = new Date();
    return Array.from({ length: count }, (_, i) => {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return {
        dateStr,
        dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNum: date.getDate(),
        fullDay: date.toLocaleDateString('en-US', { weekday: 'long' }),
        monthName: date.toLocaleDateString('en-US', { month: 'long' }),
        shortMonth: date.toLocaleDateString('en-US', { month: 'short' }),
        isToday: i === 0,
      };
    });
  };

  const nextDays = getNextDays(14);

  useEffect(() => {
    if (nextDays.length > 0 && !currentViewDate) setCurrentViewDate(nextDays[0].dateStr);
  }, []);

  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: serverAvailability, isLoading: isAvailabilityLoading } = useQuery({
    queryKey: ['doctor', 'availability', user?.userId],
    queryFn: async () => {
      const token = getAuthToken();
      const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE_URL}/availability/doctor/current`, { headers, credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load availability');
      return await res.json();
    },
    enabled: !!user
  });

  const { data: fetchedUpcomingSessions = [], isLoading: isSessionsLoading } = useQuery({
    queryKey: ['doctor', 'upcomingSessions', user?.userId],
    queryFn: async () => {
      const token = getAuthToken();
      const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE_URL}/availability/upcoming-sessions`, { headers, credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load sessions');
      return await res.json();
    },
    enabled: !!user
  });

  useEffect(() => {
    if (serverAvailability) {
      setAvailabilityType(serverAvailability.availabilityType || 'same_slots');
      setDefaultSlots(serverAvailability.defaultSlots || []);
      setActiveDates(serverAvailability.activeDates || []);
      setCustomAvailability(serverAvailability.customAvailability || []);
    }
  }, [serverAvailability]);

  useEffect(() => {
    if (fetchedUpcomingSessions) {
      setUpcomingSessions(fetchedUpcomingSessions);
    }
  }, [fetchedUpcomingSessions]);

  const handleDateClick = (dateStr: string) => {
    setCurrentViewDate(dateStr);
    if (isEditing && availabilityType === 'same_slots') {
      setActiveDates(prev => prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr]);
    }
  };

  const isSlotInPast = (dateStr: string, timeStr: string) => {
    const selectedDate = new Date(dateStr);
    if (isToday(dateStr)) {
      const timeInMs = (timeVal: string) => {
        const [h, min] = parseTime(timeVal);
        const d = new Date();
        d.setHours(h, min, 0, 0);
        return d.getTime();
      };
      return timeInMs(timeStr) < new Date().getTime();
    }
    return selectedDate.getTime() < new Date().setHours(0, 0, 0, 0);
  };

  const toggleSlot = (slot: string) => {
    if (availabilityType === 'same_slots') {
      setDefaultSlots(prev => prev.includes(slot) ? prev.filter(s => s !== slot) : [...prev, slot]);
    } else {
      setCustomAvailability(prev => {
        const idx = prev.findIndex(d => d.date === currentViewDate);
        const next = [...prev];
        if (idx >= 0) {
          const day = { ...next[idx] };
          const si = day.slots.findIndex(s => s.time === slot);
          day.slots = si >= 0 ? day.slots.filter(s => s.time !== slot) : [...day.slots, { time: slot, isBooked: false }];
          next[idx] = day;
        } else {
          next.push({ date: currentViewDate, slots: [{ time: slot, isBooked: false }] });
        }
        return next;
      });
    }
  };

  const isSlotSelected = (slot: string) => {
    const override = customAvailability.find(d => d.date === currentViewDate);
    if (isEditing) return availabilityType === 'same_slots' ? defaultSlots.includes(slot) : override?.slots.some(s => s.time === slot) || false;
    if (override?.slots.length) return override.slots.some(s => s.time === slot);
    return activeDates.includes(currentViewDate) && defaultSlots.includes(slot);
  };

  const isDateActive = (dateStr: string) => {
    const hasOverride = customAvailability.some(d => d.date === dateStr && d.slots.length > 0);
    if (!isEditing) return hasOverride || activeDates.includes(dateStr);
    return availabilityType === 'same_slots' ? activeDates.includes(dateStr) : hasOverride;
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const token = getAuthToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE_URL}/availability/save`, {
        method: 'POST', headers, credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to save');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Schedule saved!');
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['doctor', 'availability', user?.userId] });
    },
    onError: () => {
      toast.error('Error saving schedule');
    }
  });

  const handleDiscard = () => {
    if (serverAvailability) {
      setAvailabilityType(serverAvailability.availabilityType || 'same_slots');
      setDefaultSlots(serverAvailability.defaultSlots || []);
      setActiveDates(serverAvailability.activeDates || []);
      setCustomAvailability(serverAvailability.customAvailability || []);
    }
    setIsEditing(false);
  };

  const loading = saveMutation.isPending;

  const handleSave = () => {
    saveMutation.mutate({ availabilityType, defaultSlots, activeDates, customAvailability });
  };

  const getSlotInfo = (slot: string) => {
    const booked = upcomingSessions.find(s => {
      const d = new Date(s.sessionDate).toISOString().split('T')[0];
      return d === currentViewDate && s.sessionTime === slot;
    });
    return { booked, past: isSlotInPast(currentViewDate, slot), sel: isSlotSelected(slot) };
  };

  const selectedDay = nextDays.find(d => d.dateStr === currentViewDate);
  const selectedCount = ALL_SLOTS.filter(s => isSlotSelected(s)).length;

  // Design tokens — same system as the patient/doctor dashboard redesign.
  const C = {
    brand: '#1f7a8c',
    brandLight: '#eef4f4',
    brandSoft: 'rgba(31,122,140,.35)',
    bg: '#f6f3ec',
    surface: '#FFFFFF',
    border: 'rgba(27,43,46,.08)',
    borderStrong: 'rgba(27,43,46,.16)',
    text1: '#16262a',
    text2: '#6b7573',
    text3: '#8a938f',
    text4: '#c7cfcd',
    purple: '#c99a5b',
    purpleLight: '#f7f1e8',
    dark: '#16262a',
  };
  const FONT_SERIF = "'Newsreader', Georgia, serif";
  // Same frosted-glass treatment as the patient/doctor dashboards.
  const cardStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, rgba(31,122,140,.07), rgba(31,122,140,.02))',
    backdropFilter: 'blur(20px) saturate(110%)',
    WebkitBackdropFilter: 'blur(20px) saturate(110%)',
    border: '1px solid rgba(255,255,255,.55)',
    boxShadow: '0 12px 36px rgba(27,43,46,.1), inset 0 1px 0 rgba(255,255,255,.5)',
    borderRadius: 20,
  };

  const SlotGrid = ({ slots, label, icon }: { slots: string[], label: string, icon: React.ReactNode }) => (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <span style={{ color: C.text3, display: 'flex', alignItems: 'center' }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
        <div style={{ flex: 1, height: 1, background: C.border, marginLeft: 4 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))', gap: 8 }}>
        {slots.map(slot => {
          const { booked, past, sel } = getSlotInfo(slot);
          const canToggle = isEditing && !past && !booked;
          let style: React.CSSProperties = {
            height: 52, borderRadius: 10, fontSize: 13, fontWeight: 600,
            border: '1.5px solid', cursor: canToggle ? 'pointer' : 'default',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 2, transition: 'all 0.15s ease',
            fontFamily: 'Inter, sans-serif', position: 'relative', outline: 'none',
          };
          if (booked) {
            Object.assign(style, { background: C.dark, color: '#fff', borderColor: C.dark });
          } else if (past) {
            Object.assign(style, { background: '#FAFAFA', color: C.text4, borderColor: C.border, opacity: 0.6 });
          } else if (sel) {
            Object.assign(style, { background: C.brand, color: '#fff', borderColor: C.brand, boxShadow: '0 2px 12px rgba(31,122,140,0.3)' });
          } else if (isEditing) {
            Object.assign(style, { background: '#fff', color: C.text2, borderColor: C.border });
          } else {
            Object.assign(style, { background: C.bg, color: C.text4, borderColor: C.border });
          }
          return (
            <button key={slot} onClick={() => canToggle && toggleSlot(slot)} style={style} title={booked ? `${booked.patientId.firstName} ${booked.patientId.lastName}` : ''}>
              {booked ? (
                <>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>{slot}</span>
                  <span style={{ fontSize: 9, letterSpacing: '0.08em', fontWeight: 800, color: C.brand, textTransform: 'uppercase' }}>Booked</span>
                </>
              ) : (
                <span style={{ textDecoration: past ? 'line-through' : 'none' }}>{slot}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      className="min-h-screen w-full flex flex-col overflow-x-hidden pt-16 md:pt-20"
      style={{ background: C.bg, fontFamily: "'Public Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif", boxSizing: 'border-box' }}
    >
      <Toaster position="top-right" toastOptions={{ style: { fontFamily: 'Inter', fontSize: 13, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' } }} />

      {/* TOP NAV */}
      <header className="flex-none flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 py-3" style={{ borderBottom: `1px solid ${C.border}`, zIndex: 20 }}>
        {/* Left */}
        <div className="flex items-center gap-3.5">
          <button onClick={() => navigate('/doctor-dashboard')} style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.text2, flexShrink: 0 }}>
            <FiArrowLeft size={15} strokeWidth={2.5} />
          </button>
          <div>
            <p style={{ margin: 0, fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 19, color: C.text1, lineHeight: '1.2' }}>Availability</p>
            <p style={{ margin: 0, fontSize: 12, color: C.text3, fontWeight: 500, marginTop: 1 }}>Manage your schedule</p>
          </div>
        </div>

        {/* Center: Mode pill */}
        {isEditing && (
          <div className="flex items-center order-3 sm:order-2 w-full sm:w-auto" style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 3, gap: 2 }}>
            {([['same_slots', 'Weekly Default'], ['different_slots', 'Specific Day']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setAvailabilityType(v)} className="flex-1 sm:flex-none" style={{ padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.15s', background: availabilityType === v ? '#fff' : 'transparent', color: availabilityType === v ? C.text1 : C.text3, boxShadow: availabilityType === v ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
                {l}
              </button>
            ))}
          </div>
        )}

        {/* Right: Actions */}
        <div className="flex items-center gap-2 order-2 sm:order-3 ml-auto">
          {!isEditing ? (
            <button onClick={() => setIsEditing(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: C.brand, color: '#fff', border: 'none', borderRadius: 100, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 1px 8px rgba(31,122,140,0.25)', whiteSpace: 'nowrap' }}>
              <FiEdit2 size={13} strokeWidth={2.5} />
              Edit Schedule
            </button>
          ) : (
            <>
              <button onClick={handleDiscard} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'transparent', color: C.text2, border: `1px solid ${C.border}`, borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <FiX size={13} strokeWidth={2.5} />
                Discard
              </button>
              <button onClick={handleSave} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: loading ? '#7fabb5' : C.brand, color: '#fff', border: 'none', borderRadius: 100, fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', boxShadow: loading ? 'none' : '0 1px 8px rgba(31,122,140,0.25)', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
                {loading ? <div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} /> : <FiCheck size={13} strokeWidth={2.5} />}
                Save
              </button>
            </>
          )}
        </div>
      </header>

      {/* DATE STRIP */}
      <div className="flex-none px-4 sm:px-6 lg:px-8 py-2.5" style={{ borderBottom: `1px solid ${C.border}` }}>
        {isEditing && availabilityType === 'same_slots' && (
          <p style={{ fontSize: 11, color: C.text3, fontWeight: 500, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.brand, display: 'inline-block', flexShrink: 0 }} />
            Click days to mark them active. All active days share the same time slots below.
          </p>
        )}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }} className="scrollbar-hide">
          {nextDays.map(({ dateStr, dayName, dayNum, isToday, shortMonth }) => {
            const isViewing = currentViewDate === dateStr;
            const active = isDateActive(dateStr);
            const hasOverride = customAvailability.some(d => d.date === dateStr && d.slots.length > 0);
            const isDark = isViewing;
            return (
              <button key={dateStr} onClick={() => handleDateClick(dateStr)} style={{
                flexShrink: 0, width: 52, height: 62, borderRadius: 12,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                border: `1.5px solid ${isViewing ? C.brand : active ? C.brandSoft : C.border}`,
                background: isViewing ? C.brand : active && !isEditing ? C.brandLight : hasOverride ? C.purpleLight : '#fff',
                cursor: 'pointer', transition: 'all 0.15s ease', position: 'relative',
              }}>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: isDark ? 'rgba(255,255,255,0.7)' : C.text3 }}>{dayName}</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: isDark ? '#fff' : C.text1, lineHeight: 1.1 }}>{dayNum}</span>
                {isToday && !isViewing && <span style={{ fontSize: 8, fontWeight: 700, color: C.brand, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Today</span>}
                {(active || hasOverride) && !isViewing && (
                  <div style={{ position: 'absolute', bottom: 5, width: 4, height: 4, borderRadius: '50%', background: hasOverride ? C.purple : C.brand }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-5 px-4 sm:px-6 lg:px-8 py-4 pb-8">

        {/* TIME SLOTS PANEL */}
        <div style={{ ...cardStyle, flex: 1, minWidth: 0 }} className="flex flex-col overflow-hidden">
          {/* Slot panel header */}
          <div style={{ padding: '16px 20px 14px', borderBottom: `1px solid ${C.border}` }} className="flex flex-wrap items-center justify-between gap-3 flex-none">
            <div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text1 }}>
                {selectedDay ? (selectedDay.isToday ? `Today — ${selectedDay.fullDay}` : `${selectedDay.fullDay}, ${selectedDay.shortMonth} ${selectedDay.dayNum}`) : 'Select a date'}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: C.text3, fontWeight: 500 }}>
                {isEditing ? 'Click a slot to toggle availability' : `${selectedCount} slot${selectedCount !== 1 ? 's' : ''} available`}
              </p>
            </div>
            {/* Slot-state legend */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              {[
                { dot: C.brand, label: 'Available' },
                { dot: C.dark, label: 'Booked' },
                { dot: C.border, label: 'Off' },
              ].map(({ dot, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: dot, border: label === 'Off' ? `1px solid ${C.borderStrong}` : 'none' }} />
                  <span style={{ fontSize: 11, color: C.text3, fontWeight: 500 }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Slots */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 16px' }} className="scrollbar-hide">
            <SlotGrid slots={AM_SLOTS} label="Morning" icon={<FiSun size={13} strokeWidth={2} />} />
            <SlotGrid slots={PM_SLOTS} label="Afternoon & Evening" icon={<FiMoon size={13} strokeWidth={2} />} />
          </div>

          {/* Footer */}
          {!isEditing && (
            <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <p style={{ margin: 0, fontSize: 12, color: C.text3, fontWeight: 500 }}>
                {selectedCount > 0 ? `${selectedCount} time slots open on this date` : 'No slots available for this date'}
              </p>
              <button onClick={() => setIsEditing(true)} style={{ fontSize: 12, fontWeight: 700, color: C.brand, background: C.brandLight, border: `1px solid ${C.brandSoft}`, borderRadius: 8, padding: '5px 14px', cursor: 'pointer' }}>
                Edit Schedule
              </button>
            </div>
          )}
        </div>

        {/* SESSIONS SIDEBAR */}
        <div className="w-full lg:w-[260px] flex-none flex flex-col gap-3">

          {/* Stats card */}
          <div style={{ ...cardStyle, padding: '16px 16px 14px' }} className="flex-none">
            <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: C.text3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Overview</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Sessions', val: upcomingSessions.length, color: C.brand, bg: C.brandLight },
                { label: 'Active Days', val: activeDates.length + customAvailability.filter(d => d.slots.length > 0).length, color: C.purple, bg: C.purpleLight },
              ].map(({ label, val, color, bg }) => (
                <div key={label} style={{ background: bg, borderRadius: 10, padding: '10px 12px' }}>
                  <p style={{ margin: 0, fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 24, color, lineHeight: 1 }}>{val}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 11, color, fontWeight: 600, opacity: 0.75 }}>{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming sessions */}
          <div style={{ ...cardStyle, flex: 1, minHeight: 300 }} className="flex flex-col overflow-hidden">
            <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.text1 }}>Recent & Upcoming</p>
              {upcomingSessions.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 800, color: C.purple, background: C.purpleLight, padding: '2px 8px', borderRadius: 20 }}>{upcomingSessions.length}</span>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }} className="scrollbar-hide">
              {upcomingSessions.length > 0 ? upcomingSessions.map((s, i) => {
                const colors = ['#E0E7FF|#4F46E5', '#D1FAE5|#059669', '#FEE2E2|#DC2626', '#FEF3C7|#D97706'];
                const [bg, fg] = colors[i % colors.length].split('|');
                return (
                  <div key={s._id} onClick={() => setSelectedSession(s)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: i < upcomingSessions.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer' }} className="hover:bg-gray-50 transition-colors rounded-lg px-2 -mx-2">
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: fg }}>{s.patientId.firstName[0]}{s.patientId.lastName[0]}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.text1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.patientId.firstName} {s.patientId.lastName}</p>
                        {s.status === 'cancelled' && <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', background: '#FEE2E2', padding: '2px 6px', borderRadius: 12 }}>Cancelled</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.text3, fontWeight: 500 }}>
                          <FiCalendar size={10} strokeWidth={2} />
                          {new Date(s.sessionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.text3, fontWeight: 500 }}>
                          <FiClock size={10} strokeWidth={2} />
                          {s.sessionTime}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 16px', textAlign: 'center' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, border: `1px solid ${C.border}` }}>
                    <FiCalendar size={18} color={C.text4} strokeWidth={1.5} />
                  </div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.text2 }}>All clear</p>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: C.text3 }}>No upcoming sessions</p>
                </div>
              )}
            </div>

            <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
              <button onClick={() => navigate('/doctor-dashboard')} style={{ width: '100%', padding: '9px', borderRadius: 10, fontSize: 12, fontWeight: 700, color: C.text2, background: C.bg, border: `1px solid ${C.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.12s' }}>
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Session Details Modal */}
      {selectedSession && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scaleIn">
            <div className="bg-teal-600 p-5 text-white flex justify-between items-start">
              <div>
                <h3 className="font-bold text-lg mb-1">Session Details</h3>
                <p className="text-teal-100 text-sm">Order & Status Information</p>
              </div>
              <button onClick={() => setSelectedSession(null)} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                <FiX size={20} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              
              <div className="flex items-center gap-4 border-b border-gray-100 pb-5">
                <div className="w-12 h-12 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-lg">
                  {selectedSession.patientId.firstName[0]}{selectedSession.patientId.lastName[0]}
                </div>
                <div>
                  <h4 className="font-bold text-gray-800">{selectedSession.patientId.firstName} {selectedSession.patientId.lastName}</h4>
                  <p className="text-sm text-gray-500">{selectedSession.patientId.email}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <p className="text-xs text-gray-500 font-semibold mb-1 uppercase tracking-wider">Date & Time</p>
                  <p className="text-sm font-bold text-gray-800">{new Date(selectedSession.sessionDate).toLocaleDateString()}</p>
                  <p className="text-xs text-gray-600">{selectedSession.sessionTime}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <p className="text-xs text-gray-500 font-semibold mb-1 uppercase tracking-wider">Session Type</p>
                  <p className="text-sm font-bold text-gray-800 capitalize">{selectedSession.sessionType}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <p className="text-xs text-gray-500 font-semibold mb-1 uppercase tracking-wider">Status</p>
                  <span className={`inline-block px-2 py-1 rounded text-xs font-bold capitalize ${
                    selectedSession.status === 'cancelled' || selectedSession.status === 'missed' ? 'bg-red-100 text-red-700' : 
                    selectedSession.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {selectedSession.status}
                  </span>
                </div>
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <p className="text-xs text-gray-500 font-semibold mb-1 uppercase tracking-wider">Payment</p>
                  <span className={`inline-block px-2 py-1 rounded text-xs font-bold capitalize ${
                    selectedSession.paymentStatus === 'refunded' ? 'bg-orange-100 text-orange-700' :
                    selectedSession.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'
                  }`}>
                    {selectedSession.paymentStatus}
                  </span>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Order Amount</span>
                  <span className="font-bold text-gray-800">₹{selectedSession.price}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Payment ID</span>
                  <span className="font-mono text-xs text-gray-600">{selectedSession.paymentId || 'N/A'}</span>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};

export default ManageCalendar;
