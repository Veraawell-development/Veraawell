import React, { useState, useEffect } from 'react';
import { FiDownload, FiMenu, FiEye } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import ViewContentModal from '../components/ViewContentModal';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import { formatDate } from '../utils/dateUtils';
import logger from '../utils/logger';
import type { Report } from '../types';
import BackToDashboard from '../components/BackToDashboard';

const ReportsRecommendationPage: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      setLoading(true);
      if (!user) return;

      const response = await fetch(`${API_CONFIG.BASE_URL}/session-tools/reports/patient/${user.userId}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const reportsArray = data.reports || [];
      logger.info('Reports received:', reportsArray.length);
      setReports(reportsArray);
    } catch (error) {
      logger.error('Error fetching reports:', error);
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  const markAsViewed = async (reportId: string) => {
    try {
      await fetch(`${API_CONFIG.BASE_URL}/session-tools/reports/${reportId}/view`, {
        method: 'PUT',
        credentials: 'include'
      });
    } catch (error) {
      logger.error('Error marking report as viewed:', error);
    }
  };

  const handleDownload = (report: Report) => {
    markAsViewed(report._id);

    import('jspdf').then(({ jsPDF }) => {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      
      // Colors and Fonts
      doc.setFont('helvetica');
      const teal = '#0D9488';
      const gray = '#4B5563';
      const black = '#111827';
      
      // Header Section
      doc.setFillColor(13, 148, 136); // Teal header bar
      doc.rect(0, 0, pageWidth, 25, 'F');
      
      doc.setTextColor('#FFFFFF');
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('Veerawell', 15, 17);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Official Medical Report', pageWidth - 15, 16, { align: 'right' });

      // Title
      doc.setTextColor(black);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(report.title, 15, 40);

      // Meta Info Card
      doc.setFillColor(249, 250, 251);
      doc.setDrawColor(229, 231, 235);
      doc.roundedRect(15, 48, pageWidth - 30, 25, 3, 3, 'FD');
      
      doc.setFontSize(10);
      doc.setTextColor(gray);
      doc.text('REPORT TYPE:', 20, 56);
      doc.text('DATE:', 20, 66);
      doc.text('PSYCHOLOGIST:', pageWidth / 2, 56);

      doc.setTextColor(black);
      doc.setFont('helvetica', 'bold');
      doc.text(report.reportType || 'Consultation Report', 50, 56);
      doc.text(formatDate(report.createdAt), 50, 66);
      doc.text(`Dr. ${report.doctorId?.firstName || 'Unknown'} ${report.doctorId?.lastName || ''}`, (pageWidth / 2) + 32, 56);

      // Content Section
      let currentY = 85;
      
      let parsedContent: any = null;
      try {
          if (report.content.trim().startsWith('{') && report.content.trim().endsWith('}')) {
              parsedContent = JSON.parse(report.content);
          }
      } catch (e) {
          parsedContent = null;
      }

      const drawSection = (title: string, text: string) => {
        if (!text) return;
        if (currentY > 260) {
          doc.addPage();
          currentY = 20;
        }
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(teal);
        doc.text(title.toUpperCase(), 15, currentY);
        
        currentY += 7;
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(black);
        const splitText = doc.splitTextToSize(text, pageWidth - 30);
        doc.text(splitText, 15, currentY);
        
        currentY += (splitText.length * 5) + 10;
      };

      if (parsedContent) {
        if (parsedContent.diagnosis) drawSection('Primary Diagnosis', parsedContent.diagnosis);
        if (parsedContent.mood) drawSection('Mood Assessment', parsedContent.mood);
        if (parsedContent.progress) drawSection('Overall Progress', `${parsedContent.progress} / 10`);
        if (parsedContent.observations && Array.isArray(parsedContent.observations)) {
          drawSection('Clinical Observations', parsedContent.observations.join('\n• '));
        }
        if (parsedContent.summary) drawSection('Consultation Summary', parsedContent.summary);
        if (parsedContent.recommendations) drawSection('Recommendations', parsedContent.recommendations);
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(black);
        const splitText = doc.splitTextToSize(report.content, pageWidth - 30);
        doc.text(splitText, 15, currentY);
      }
      
      // Footer
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(156, 163, 175);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, 285, { align: 'center' });
        doc.text('This is an electronically generated report.', pageWidth / 2, 290, { align: 'center' });
      }

      const safeTitle = report.title.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      doc.save(`${safeTitle}.pdf`);
    }).catch(err => {
      console.error('Failed to generate PDF', err);
      // Fallback
      const content = `${report.title}\n\nType: ${report.reportType}\n\nDate: ${formatDate(report.createdAt)}\nDoctor: Dr. ${report.doctorId?.firstName || 'Unknown'} ${report.doctorId?.lastName || ''}\n\n${report.content}`;
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeTitle = report.title.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      a.download = `${safeTitle}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  const handleView = (report: Report) => {
    markAsViewed(report._id);
    setSelectedReport(report);
    setViewModalOpen(true);
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
              No reports available
            </h3>
            <p className="text-gray-500 text-[14px] mb-8" style={{ fontFamily: 'Inter, sans-serif' }}>
              Your consultation reports and recommendations will appear here.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2 pb-10 min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {reports.map((report) => (
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
        content={selectedReport?.content || 'No content available.'}
        date={selectedReport?.createdAt || ''}
        doctorName={selectedReport ? `Dr. ${selectedReport.doctorId?.firstName || 'Unknown'} ${selectedReport.doctorId?.lastName || ''}` : ''}
        type={selectedReport?.reportType || 'Report'}
        onDownload={() => selectedReport && handleDownload(selectedReport)}
      />
    </div>
  );
};

export default ReportsRecommendationPage;
