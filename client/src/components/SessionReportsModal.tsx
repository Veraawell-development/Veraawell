import React, { useState, useEffect } from 'react';
import { API_CONFIG } from '../config/api';
import ReportCard from './ReportCard';
import logger from '../utils/logger';

interface Report {
    _id: string;
    type: 'session-notes' | 'prescription' | 'progress-summary' | 'treatment-plan' | 'other';
    title: string;
    doctorId: {
        firstName: string;
        lastName: string;
    };
    createdAt: string;
    content: string;
    attachments: Array<{
        filename: string;
        url: string;
    }>;
}

interface SessionReportsModalProps {
    isOpen: boolean;
    onClose: () => void;
    sessionId: string;
}

const SessionReportsModal: React.FC<SessionReportsModalProps> = ({
    isOpen,
    onClose,
    sessionId
}) => {
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedReport, setSelectedReport] = useState<Report | null>(null);

    useEffect(() => {
        if (isOpen && sessionId) {
            fetchReports();
        }
    }, [isOpen, sessionId]);

    const fetchReports = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}/session-reports/session/${sessionId}`, {
                credentials: 'include'
            });
            if (response.ok) {
                const data = await response.json();
                setReports(data);
            }
        } catch (error) {
            logger.error('Error fetching reports:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = (report: Report) => {
        // Generate PDF logic will go here
        // For now, construct a simple text blob
        const content = `Type: ${report.type}\nTitle: ${report.title}\nDate: ${new Date(report.createdAt).toLocaleDateString()}\n\nContent:\n${report.content}`;
        const blob = new Blob([content], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${report.title.replace(/\s+/g, '_')}.txt`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>
                            Session Reports
                        </h2>
                        <p className="text-sm text-gray-500 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                            View insights and documents from this session
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600 mb-4"></div>
                            <p className="text-sm text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>Loading reports...</p>
                        </div>
                    ) : reports.length === 0 ? (
                        <div className="text-center py-16 px-4">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-medium text-gray-900 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>No reports yet</h3>
                            <p className="text-gray-500 max-w-xs mx-auto text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Your doctor hasn't uploaded any reports for this session yet. Check back later.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {reports.map((report) => (
                                <ReportCard
                                    key={report._id}
                                    type={report.type}
                                    title={report.title}
                                    doctorName={`Dr. ${report.doctorId.firstName} ${report.doctorId.lastName}`}
                                    date={report.createdAt}
                                    onView={() => setSelectedReport(report)}
                                    onDownload={() => handleDownload(report)}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer actions */}
                {reports.length > 0 && (
                    <div className="p-4 border-t border-gray-100 bg-white">
                        <button className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white font-medium py-3 rounded-xl hover:bg-gray-800 transition-colors shadow-lg shadow-gray-200">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download All Reports
                        </button>
                    </div>
                )}
            </div>

            {/* View Modal logic would go here if extending */}
            {selectedReport && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
                        <div className="p-4 border-b flex justify-between items-center">
                            <h3 className="font-bold">{selectedReport.title}</h3>
                            <button onClick={() => setSelectedReport(null)}>Close</button>
                        </div>
                        <div className="p-6 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-relaxed">
                            {selectedReport.content}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SessionReportsModal;
