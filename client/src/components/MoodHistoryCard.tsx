import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FiSmile } from 'react-icons/fi';
import { API_CONFIG } from '../config/api';

interface MoodEntry {
  date: string; // YYYY-MM-DD
  mood: 1 | 2 | 3 | 4 | 5;
  label: string;
}

const DAYS_SHOWN = 14;

const MOOD_META: Record<1 | 2 | 3 | 4 | 5, { color: string; label: string }> = {
  1: { color: '#E8956D', label: 'Struggling' },
  2: { color: '#C4A882', label: 'Low' },
  3: { color: '#9BB5BC', label: 'Okay' },
  4: { color: '#6BA888', label: 'Good' },
  5: { color: '#0097B2', label: 'Great' },
};

const toISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Fixed 14-slot timeline ending today, oldest -> newest, so the chart always reads as
// a continuous strip regardless of how sparse the logged data is.
const buildTimeline = () => {
  const days: { date: string; jsDate: Date }[] = [];
  const today = new Date();
  for (let i = DAYS_SHOWN - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push({ date: toISODate(d), jsDate: d });
  }
  return days;
};

const friendlyInsight = (average: number | null) => {
  if (average === null) return null;
  if (average >= 4.5) return { text: "You've been feeling great lately", emoji: '✨' };
  if (average >= 3.5) return { text: 'Mostly good days this week', emoji: '🌤' };
  if (average >= 2.5) return { text: "It's been a steady, okay stretch", emoji: '🌥' };
  if (average >= 1.5) return { text: 'A tough few days — be gentle with yourself', emoji: '💙' };
  return { text: "Things have felt heavy lately — you're not alone", emoji: '💙' };
};

const MoodHistoryCard: React.FC = () => {
  const { data: entries = [], isLoading } = useQuery<MoodEntry[]>({
    queryKey: ['patient', 'moodHistory'],
    queryFn: async () => {
      const res = await fetch(`${API_CONFIG.BASE_URL}/session-tools/mood/history?days=${DAYS_SHOWN}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch mood history');
      const data = await res.json();
      return data.entries || [];
    },
  });

  const entryByDate = new Map(entries.map((e) => [e.date, e]));
  const timeline = buildTimeline();
  const todayISO = toISODate(new Date());

  const average = entries.length
    ? Math.round((entries.reduce((sum, e) => sum + e.mood, 0) / entries.length) * 10) / 10
    : null;
  const insight = friendlyInsight(average);

  return (
    <div
      className="rounded-[16px] border border-teal-100 shadow-sm p-6 mb-8"
      style={{ background: 'linear-gradient(135deg, #F2FAF9 0%, #FFFFFF 65%)' }}
    >
      <div className="mb-2">
        <h2 className="text-[16px] font-bold text-gray-800 tracking-tight mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
          Mood Check-In
        </h2>
        <p className="text-[13px] text-gray-500 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
          A little diary of how you've been feeling
        </p>
      </div>

      {isLoading ? (
        <div className="h-32 animate-pulse bg-white/60 rounded-lg mt-5" />
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-8">
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-teal-50 text-teal-500 mb-3">
            <FiSmile size={20} />
          </div>
          <p className="text-[13px] text-gray-500 font-medium max-w-xs" style={{ fontFamily: 'Inter, sans-serif' }}>
            Your daily check-ins will show up here once you start logging how you feel.
          </p>
        </div>
      ) : (
        <>
          <div
            className="grid gap-1.5 h-28 mt-5"
            style={{ gridTemplateColumns: `repeat(${DAYS_SHOWN}, minmax(0, 1fr))` }}
          >
            {timeline.map(({ date, jsDate }) => {
              const entry = entryByDate.get(date);
              const isToday = date === todayISO;
              const meta = entry ? MOOD_META[entry.mood] : null;
              const heightPct = entry ? 24 + (entry.mood - 1) * 19 : 0; // 24% - 100%

              return (
                <div key={date} className="flex flex-col items-center justify-end h-full group relative">
                  {entry && meta ? (
                    <div
                      className="w-full max-w-[18px] rounded-[5px] transition-all duration-200 group-hover:opacity-80"
                      style={{
                        height: `${heightPct}%`,
                        background: meta.color,
                        outline: isToday ? `2px solid ${meta.color}55` : 'none',
                        outlineOffset: '2px',
                      }}
                    />
                  ) : (
                    <div
                      className="w-full max-w-[18px] rounded-full border border-dashed border-gray-200"
                      style={{ height: '6px' }}
                    />
                  )}

                  <div
                    className="absolute -top-8 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap bg-gray-800 text-white text-[11px] font-medium px-2 py-1 rounded-md z-10"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    {entry && meta
                      ? `${meta.label} · ${jsDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`
                      : `No check-in · ${jsDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            className="grid gap-1.5 mt-2"
            style={{ gridTemplateColumns: `repeat(${DAYS_SHOWN}, minmax(0, 1fr))` }}
          >
            {timeline.map(({ date, jsDate }) => {
              const isToday = date === todayISO;
              const showMonth = jsDate.getDate() === 1 || date === timeline[0].date;
              return (
                <span
                  key={date}
                  className="text-center text-[10px] font-medium truncate"
                  style={{ fontFamily: 'Inter, sans-serif', color: isToday ? '#0097B2' : '#9CA3AF' }}
                >
                  {showMonth ? jsDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : jsDate.getDate()}
                </span>
              );
            })}
          </div>

          <div className="flex items-center justify-between flex-wrap gap-3 mt-5 pt-4 border-t border-teal-100/70">
            {insight && (
              <p className="text-[13px] font-medium text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                <span className="mr-1.5">{insight.emoji}</span>
                {insight.text}
              </p>
            )}
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5">
              {(Object.entries(MOOD_META) as unknown as [string, { color: string; label: string }][]).map(([value, meta]) => (
                <div key={value} className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
                  <span className="text-[10px] font-medium text-gray-400" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {meta.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MoodHistoryCard;
