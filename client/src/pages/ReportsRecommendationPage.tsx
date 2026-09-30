import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { formatReportText } from '../utils/reportContent';
import { generateReportPdf } from '../utils/reportPdf';
import { FiDownload, FiMenu, FiEye } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import ViewContentModal from '../components/ViewContentModal';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import { formatDate } from '../utils/dateUtils';
import logger from '../utils/logger';
import type { Report } from '../types';
import BackToDashboard from '../components/BackToDashboard';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const ReportsRecommendationPage: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: reports = [], isLoading: loading } = useQuery({
    queryKey: ['patient', 'reports', user?.userId],
    queryFn: async () => {
      if (!user) return [];
      const response = await fetch(`${API_CONFIG.BASE_URL}/session-tools/reports/patient/${user.userId}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      return data.reports || [];
    },
    enabled: !!user
  });

  const markAsViewedMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const response = await fetch(`${API_CONFIG.BASE_URL}/session-tools/reports/${reportId}/view`, {
        method: 'PUT',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to mark as viewed');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient', 'reports', user?.userId] });
    },
    onError: (error) => {
      logger.error('Error marking report as viewed:', error);
    }
  });

  const handleDownload = (report: Report) => {
    if (!report.viewedByPatient) {
      markAsViewedMutation.mutate(report._id);
    }
    // One generator for every report download — see utils/reportPdf.ts for
    // why the four that existed before were a problem.
    generateReportPdf(report as any).catch((err) => {
      console.error('Failed to generate PDF', err);
      toast.error('Could not generate the PDF. Please try again.');
    });
  };

  const handleView = (report: Report) => {
    setSelectedReport(report);
    setViewModalOpen(true);
    if (!report.viewedByPatient) {
      markAsViewedMutation.mutate(report._id);
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    if (!firstName) return 'DR';
    return `${firstName[0]}${lastName ? lastName[0] : ''}`.toUpperCase();
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
            onClick={() => navigate('/patient-dashboard')} 
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
            Reports & Recommendation
          </h1>
          <p className="text-[15px] text-gray-500 font-medium leading-relaxed max-w-2xl" style={{ fontFamily: 'Inter, sans-serif' }}>
            View and download the consultation reports and prescriptions provided by your psychologists.
          </p>
        </div>

        {reports.length === 0 ? (
          <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm p-16 text-center max-w-3xl mx-auto mt-4 shrink-0">
            <div className="w-16 h-16 bg-gray-50 border border-gray-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-[18px] font-bold text-gray-800 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
              No Reports Available
            </h3>
            <p className="text-gray-500 text-[14px] mb-8" style={{ fontFamily: 'Inter, sans-serif' }}>
              Your doctor hasn't uploaded any reports for you yet.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2 pb-10 min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {reports.map((report: Report) => (
                <div
                  key={report._id}
                  className="group bg-white rounded-[16px] border border-gray-100 hover:border-teal-200 shadow-sm hover:shadow-md transition-all overflow-hidden p-6 flex flex-col"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
                        <span className="text-[12px] font-bold text-teal-700 tracking-wider">
                          {getInitials(report.doctorId?.firstName || '', report.doctorId?.lastName || '')}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <h3 className="text-[15px] font-bold text-gray-800 tracking-tight line-clamp-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                          Dr. {report.doctorId?.firstName || 'Unknown'} {report.doctorId?.lastName || ''}
                        </h3>
                        <p className="text-[12px] font-medium text-gray-400" style={{ fontFamily: 'Inter, sans-serif' }}>
                          {formatDate(report.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mb-6">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-teal-50 text-teal-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {report.reportType || 'Consultation Report'}
                    </span>
                  </div>

                  <div className="mt-auto pt-4 border-t border-gray-50 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleView(report)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 font-bold text-gray-500 hover:text-teal-600 hover:bg-teal-50 transition-colors text-[11px] uppercase tracking-wider px-3 py-2 rounded-lg border border-gray-100 group-hover:border-teal-100"
                    >
                      <FiEye className="w-3.5 h-3.5" />
                      View
                    </button>
                    <button
                      onClick={() => handleDownload(report)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 font-bold text-gray-500 hover:text-teal-600 hover:bg-teal-50 transition-colors text-[11px] uppercase tracking-wider px-3 py-2 rounded-lg border border-gray-100 group-hover:border-teal-100"
                    >
                      <FiDownload className="w-3.5 h-3.5" />
                      Save
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ViewContentModal
        isOpen={viewModalOpen}
        onClose={() => setViewModalOpen(false)}
        title={selectedReport?.title || 'Report Details'}
        content={formatReportText(selectedReport?.content) || 'No content available.'}
        date={selectedReport?.createdAt || ''}
        doctorName={selectedReport ? `Dr. ${selectedReport.doctorId?.firstName || 'Unknown'} ${selectedReport.doctorId?.lastName || ''}` : ''}
        type={selectedReport?.reportType || 'Report'}
        onDownload={() => selectedReport && handleDownload(selectedReport)}
      />
    </div>
  );
};

export default ReportsRecommendationPage;
