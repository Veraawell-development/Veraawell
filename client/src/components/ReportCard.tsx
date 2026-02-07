import React from 'react';

interface ReportCardProps {
    type: 'session-notes' | 'prescription' | 'progress-summary' | 'treatment-plan' | 'other';
    title: string;
    doctorName: string;
    date: string;
    onView: () => void;
    onDownload: () => void;
}

const ReportCard: React.FC<ReportCardProps> = ({
    type,
    title,
    doctorName,
    date,
    onView,
    onDownload
}) => {
    const getIcon = () => {
        switch (type) {
            case 'session-notes':
                return (
                    <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                );
            case 'prescription':
                return (
                    <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                );
            case 'progress-summary':
                return (
                    <svg className="w-6 h-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                );
            default:
                return (
                    <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                );
        }
    };

    const getLabel = () => {
        switch (type) {
            case 'session-notes': return 'Session Notes';
            case 'prescription': return 'Prescription';
            case 'progress-summary': return 'Progress Summary';
            case 'treatment-plan': return 'Treatment Plan';
            default: return 'Document';
        }
    };

    return (
        <div className="bg-white border border-gray-100 rounded-lg p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-50 rounded-lg">
                        {getIcon()}
                    </div>
                    <div>
                        <h4 className="font-semibold text-gray-900 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {title || getLabel()}
                        </h4>
                        <p className="text-xs text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {doctorName} • {new Date(date).toLocaleDateString()}
                        </p>
                    </div>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${type === 'prescription' ? 'bg-green-50 text-green-600' :
                        type === 'session-notes' ? 'bg-blue-50 text-blue-600' :
                            'bg-gray-50 text-gray-600'
                    }`}>
                    {getLabel()}
                </span>
            </div>

            <div className="flex gap-2 mt-4">
                <button
                    onClick={onView}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    View
                </button>
                <button
                    onClick={onDownload}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md transition-colors"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download PDF
                </button>
            </div>
        </div>
    );
};

export default ReportCard;
