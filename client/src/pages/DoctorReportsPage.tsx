import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiDownload } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config/api';
import { useQuery } from '@tanstack/react-query';

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

  const formatDateStr = (date: Date) => {
    const day = date.getDate();
    const month = date.toLocaleString('en-US', { month: 'long' });
    const year = date.getFullYear();

    const suffix = (d: number) => {
      if (d > 3 && d < 21) return 'th';
      switch (d % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
      }
    };

    return `${day}${suffix(day)} ${month} ${year}`;
  };

  const { data: reports = [], isLoading: loading } = useQuery({
    queryKey: ['doctor', 'reports', user?.userId],
    queryFn: async () => {
      if (!user) return [];
      const token = localStorage.getItem('token');
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

  const getInitials = (name: string) => {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name ? name[0].toUpperCase() : '';
  };

  if (loading) {
    return (
      <div className="h-[calc(100vh-80px)] flex items-center justify-center bg-[#FAFAFA]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 text-[13px] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>Loading reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen pt-[64px] md:pt-[80px] bg-[#FAFAFA] font-sans flex flex-col overflow-hidden box-border">
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

          <h1 className="text-[32px] md:text-[36px] font-extrabold text-gray-800 tracking-tight mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
            Reports
          </h1>
          <p className="text-[15px] text-gray-500 font-medium leading-relaxed max-w-2xl" style={{ fontFamily: 'Inter, sans-serif' }}>
            View and download reports for your patients.
          </p>
        </div>

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
