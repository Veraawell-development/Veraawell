import { formatDate as formatIstDate } from '../utils/dateUtils';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiDownload, FiEdit3 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config/api';
import { getAuthToken } from '../utils/authToken';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PostSessionReportModal from '../components/PostSessionReportModal';
import { resolveSessionStart, formatSessionDay } from '../utils/dateUtils';
import type { Session } from '../types';

/** A completed session whose post-session report hasn't been filed. */
interface UnreportedSession extends Session {
  postSessionReportCompleted?: boolean;
}

interface PatientReport {
  _id: string;
  patientName: string;
  lastDate: string;
  rawDate: Date;
  patientId: string;
  title: string;
  reportType: string;
}

const DoctorReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [writingFor, setWritingFor] = useState<UnreportedSession | null>(null);

  /**
   * "Reports to write": completed sessions with no post-session report.
   *
   * Skipping the report modal after a call said "write it later from the
   * Reports section", but nothing here let a doctor do that — a skip, a
   * refresh or the call room's Back button lost the report for good. Built on
   * the existing doctor-scoped /sessions/my-sessions list (newest first),
   * filtered on the session's own postSessionReportCompleted flag, which the
   * server sets when a report is filed against it.
   */
  const { data: reportsToWrite = [] } = useQuery<UnreportedSession[]>({
    queryKey: ['doctor', 'reports-to-write', user?.userId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/sessions/my-sessions?limit=200`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch sessions');
      const sessions = await response.json();
      return (Array.isArray(sessions) ? sessions : []).filter((s: UnreportedSession) =>
        s.status === 'completed' && !s.postSessionReportCompleted && !!s.patientId
      );
    },
    enabled: !!user
  });

  // The IST calendar day, like every date on the platform.
  const formatDateStr = (date: Date) => formatIstDate(date.toISOString());

  const { data: reports = [], isLoading: loading } = useQuery({
    // Distinct from DoctorDashboard's ['doctor', 'reports', userId, 'recent']:
    // this caches a reshaped list, and sharing a key mixed the two shapes.
    queryKey: ['doctor', 'reports', user?.userId, 'by-patient'],
    queryFn: async () => {
      if (!user) return [];
      const token = getAuthToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API_BASE_URL}/session-tools/reports/doctor/${user.userId}`, {
        credentials: 'include',
        headers
      });

      if (!response.ok) throw new Error('Failed to fetch reports');
      const data = await response.json();
      const allReports = data.reports || [];

      const formattedReports = allReports.map((report: any) => {
        const patientId = report.patientId?._id || report.patientId;
        const patientName = `${report.patientId?.firstName || ''} ${report.patientId?.lastName || ''}`.trim();
        const reportDate = new Date(report.createdAt);

        return {
          _id: report._id,
          patientName: patientName || 'Unknown Patient',
          lastDate: formatDateStr(reportDate),
          rawDate: reportDate,
          patientId,
          title: report.title || 'Untitled Report',
          reportType: report.reportType
        };
      });

      formattedReports.sort((a: any, b: any) => b.rawDate.getTime() - a.rawDate.getTime());
      return formattedReports;
    },
    enabled: !!user
  });

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = String(name).split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return String(name)[0].toUpperCase();
  };

  if (loading) {
    return (
      <div className="h-[calc(100vh-80px)] flex items-center justify-center bg-[#f6f3ec]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 text-[13px] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>Loading reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen pt-[64px] md:pt-[80px] bg-[#f6f3ec] font-sans flex flex-col overflow-hidden box-border">
      {/* Main Content Area */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 md:py-10 flex flex-col min-h-0">
        
        <div className="mb-8 max-w-2xl relative shrink-0">
          <button 
            onClick={() => navigate('/doctor-dashboard')} 
            className="flex items-center gap-2 text-[13px] font-semibold text-gray-500 hover:text-teal-600 transition-colors mb-5 group"
            aria-label="Back to Dashboard"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dashboard
          </button>

          <h1 className="text-[32px] md:text-[36px] font-medium text-gray-800 mb-3" style={{ fontFamily: "'Newsreader', Georgia, serif", letterSpacing: '-0.01em' }}>
            Reports
          </h1>
          <p className="text-[15px] text-gray-500 font-medium leading-relaxed max-w-2xl" style={{ fontFamily: 'Inter, sans-serif' }}>
            View and download reports for your patients.
          </p>
        </div>

        {reportsToWrite.length > 0 && (
          <section className="mb-8 shrink-0" aria-labelledby="reports-to-write-heading">
            <div className="flex items-baseline gap-3 mb-4">
              <h2 id="reports-to-write-heading" className="text-[18px] font-bold text-gray-800" style={{ fontFamily: 'Inter, sans-serif' }}>
                Reports to write
              </h2>
              <span className="text-[12px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                {reportsToWrite.length}
              </span>
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[40vh] overflow-y-auto pr-2">
              {reportsToWrite.map((session) => {
                const name = `${session.patientId?.firstName || ''} ${session.patientId?.lastName || ''}`.trim() || 'Patient';
                const start = resolveSessionStart(session);
                return (
                  <li key={session._id} className="bg-white rounded-[14px] border border-amber-100 shadow-sm p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                      <span className="text-[11px] font-bold text-amber-700 tracking-wider">{getInitials(name)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-gray-800 truncate" style={{ fontFamily: 'Inter, sans-serif' }}>{name}</p>
                      <p className="text-[12px] text-gray-400 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {Number.isNaN(start.getTime()) ? 'Session' : formatSessionDay(start)} · {session.duration || 60} min
                      </p>
                    </div>
                    <button
                      onClick={() => setWritingFor(session)}
                      className="inline-flex items-center gap-1.5 font-bold text-white bg-teal-600 hover:bg-teal-700 transition-colors text-[11px] uppercase tracking-wider px-3 py-2 rounded-lg shrink-0"
                    >
                      <FiEdit3 className="w-3.5 h-3.5" />
                      Write
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {writingFor && (
          <PostSessionReportModal
            // Keyed so each session starts from an empty form.
            key={writingFor._id}
            isOpen={true}
            sessionId={writingFor._id}
            patientId={writingFor.patientId?._id}
            patientName={`${writingFor.patientId?.firstName || ''} ${writingFor.patientId?.lastName || ''}`.trim()}
            doctorName={`${user?.firstName || ''} ${user?.lastName || ''}`.trim()}
            sessionDuration={writingFor.duration || 60}
            onSubmit={() => {
              setWritingFor(null);
              queryClient.invalidateQueries({ queryKey: ['doctor'] });
              toast.success('Report submitted successfully!');
            }}
            onCancel={() => setWritingFor(null)}
          />
        )}

        {reports.length === 0 ? (
          <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm p-16 text-center max-w-3xl mx-auto mt-4 shrink-0">
            <div className="w-16 h-16 bg-gray-50 border border-gray-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <FiDownload className="w-6 h-6 text-gray-400" />
            </div>
            <h3 className="text-[18px] font-bold text-gray-800 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
              No Reports Yet
            </h3>
            <p className="text-gray-500 text-[14px] mb-8" style={{ fontFamily: 'Inter, sans-serif' }}>
              You haven't generated any reports yet.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2 pb-10 min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {reports.map((report: PatientReport) => (
                <div
                  key={report._id}
                  className="group bg-white rounded-[16px] border border-gray-100 hover:border-teal-200 shadow-sm hover:shadow-md transition-all overflow-hidden p-6 flex flex-col"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
                        <span className="text-[12px] font-bold text-teal-700 tracking-wider">
                           {getInitials(report.patientName)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <h3 className="text-[15px] font-bold text-gray-800 tracking-tight line-clamp-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                          {report.patientName}
                        </h3>
                        <p className="text-[12px] font-medium text-gray-400" style={{ fontFamily: 'Inter, sans-serif' }}>
                          {report.lastDate}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mb-6 flex flex-col gap-2">
                    <p className="text-[14px] font-bold text-gray-700 line-clamp-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {report.title}
                    </p>
                    <div className="flex">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase bg-gray-100 text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {report.reportType}
                      </span>
                    </div>
                  </div>

                  <div className="mt-auto pt-4 border-t border-gray-50 flex items-center justify-between gap-2">
                    <button
                      onClick={() => navigate(`/doctor-reports/${report.patientId}`)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 font-bold text-gray-500 hover:text-teal-600 hover:bg-teal-50 transition-colors text-[11px] uppercase tracking-wider px-3 py-2 rounded-lg border border-gray-100 group-hover:border-teal-100"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DoctorReportsPage;
