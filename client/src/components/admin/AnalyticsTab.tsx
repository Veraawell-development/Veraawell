import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FiClock, FiUserCheck, FiUsers } from 'react-icons/fi';
import { adminFetch, adminQueryRetry } from '../../utils/adminApi';
import { Card, LoadingBlock, QueryErrorState } from './AdminUI';
import { statisticsQuery } from './queries';
import type { Analytics } from './types';

const AnalyticsTab: React.FC = () => {
  const stats = useQuery(statisticsQuery);
  const analytics = useQuery({
    queryKey: ['admin', 'analytics'],
    queryFn: () => adminFetch<Analytics>('/admin/approvals/analytics'),
    retry: adminQueryRetry,
  });

  const s = stats.data;
  const a = analytics.data;
  // Guarded on the nested objects: a response missing one used to throw
  // during render and white-screen the whole console, not just this tab.
  const statsReady = !!(s?.doctors && s?.patients);
  const analyticsReady = !!(a?.sessions && a?.revenue && a?.content && a?.growth && Array.isArray(a?.topDoctors));
  const maxSessions = a?.topDoctors?.reduce((max, d) => (d.sessionCount > max ? d.sessionCount : max), 0) || 1;

  return (
    <div className="space-y-6">
      {stats.isError ? (
        <Card><QueryErrorState error={stats.error} onRetry={() => { void stats.refetch(); }} retrying={stats.isFetching} title="Couldn't load the platform counts" /></Card>
      ) : stats.isLoading ? (
        <Card><LoadingBlock label="Loading counts…" /></Card>
      ) : statsReady && s ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Pending Doctors</span>
              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl"><FiClock size={16} /></div>
            </div>
            <p className="text-4xl font-bold text-neutral-900">{s.doctors.pending}</p>
            <p className="text-[11px] text-neutral-500 mt-1 font-medium">Requires review</p>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Approved Doctors</span>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><FiUserCheck size={16} /></div>
            </div>
            <p className="text-4xl font-bold text-neutral-900">{s.doctors.approved}</p>
            <p className="text-[11px] text-emerald-600 font-semibold mt-1">Active practitioners · {s.doctors.total} registered</p>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm sm:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Total Patients</span>
              <div className="p-2 bg-[#0097b2]/10 text-[#0097b2] rounded-xl"><FiUsers size={16} /></div>
            </div>
            <p className="text-4xl font-bold text-neutral-900">{s.patients.total}</p>
            <p className="text-[11px] text-neutral-500 mt-1 font-medium">Registered users</p>
          </div>
        </div>
      ) : null}

      {analytics.isError ? (
        <Card><QueryErrorState error={analytics.error} onRetry={() => { void analytics.refetch(); }} retrying={analytics.isFetching} title="Couldn't load analytics" /></Card>
      ) : analytics.isLoading ? (
        <Card><LoadingBlock label="Loading analytics…" /></Card>
      ) : analyticsReady && a ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-5 rounded-2xl border border-neutral-100 shadow-sm">
              <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Total Sessions</p>
              <p className="text-3xl font-bold text-neutral-900">{a.sessions.total}</p>
              <p className="text-[11px] text-emerald-600 font-semibold mt-1">+{a.sessions.last7Days} booked this week</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-neutral-100 shadow-sm">
              <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Revenue (all time)</p>
              <p className="text-3xl font-bold text-neutral-900">₹{Number(a.revenue.total || 0).toLocaleString('en-IN')}</p>
              <p className="text-[11px] text-neutral-500 mt-1">₹{Number(a.revenue.last30Days || 0).toLocaleString('en-IN')} from sessions booked in the last 30 days</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-neutral-100 shadow-sm">
              <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Reports Created</p>
              <p className="text-3xl font-bold text-neutral-900">{a.content.reports}</p>
              <p className="text-[11px] text-neutral-500 mt-1">{a.content.tasks} tasks assigned</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-neutral-100 shadow-sm">
              <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2">User Growth (30 days)</p>
              <p className="text-3xl font-bold text-neutral-900">+{a.growth.newPatients30Days}</p>
              <p className="text-[11px] text-neutral-500 mt-1">
                New patients · <span className="font-semibold text-neutral-700">+{a.growth.newDoctors30Days}</span> new doctors
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm">
              <h3 className="text-sm font-semibold text-neutral-900 mb-5">Session Breakdown</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-neutral-500 font-medium">Completed</span>
                  <span className="font-bold text-emerald-600 text-sm">{a.sessions.completed}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-neutral-500 font-medium">Upcoming</span>
                  <span className="font-bold text-blue-600 text-sm">{a.sessions.upcoming}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-neutral-500 font-medium">Cancelled</span>
                  <span className="font-bold text-red-600 text-sm">{a.sessions.cancelled}</span>
                </div>
                <div className="pt-4 border-t border-neutral-50 flex justify-between items-center text-xs">
                  <span className="font-semibold text-neutral-700">Avg. Revenue / Completed Session</span>
                  <span className="font-bold text-[#0097b2] text-sm">₹{a.revenue.averagePerSession}</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm">
              <h3 className="text-sm font-semibold text-neutral-900 mb-5">Top Performing Doctors</h3>
              <div className="space-y-4">
                {a.topDoctors.length === 0 ? (
                  <p className="text-xs text-neutral-400 text-center py-4">No completed sessions yet</p>
                ) : (
                  a.topDoctors.map((doctor, index) => (
                    <div key={`${doctor.name}-${index}`} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-neutral-700 font-medium">{index + 1}. Dr. {doctor.name}</span>
                        <span className="font-bold text-[#0097b2]">{doctor.sessionCount} sessions</span>
                      </div>
                      <div className="w-full h-1.5 bg-neutral-50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#0097b2] rounded-full transition-all duration-500"
                          style={{ width: `${(doctor.sessionCount / maxSessions) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default AnalyticsTab;
