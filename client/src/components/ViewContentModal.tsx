import React from 'react';
import { FiX, FiDownload, FiCalendar, FiUser } from 'react-icons/fi';
import { formatDate } from '../utils/dateUtils';

interface ViewContentModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    content: string;
    date: string;
    doctorName: string;
    type: string;
    onDownload?: () => void;
}

const ViewContentModal: React.FC<ViewContentModalProps> = ({
    isOpen,
    onClose,
    title,
    content,
    date,
    doctorName,
    type,
    onDownload
}) => {
    if (!isOpen) return null;

    let parsedContent: any = null;
    try {
        if (content.trim().startsWith('{') && content.trim().endsWith('}')) {
            parsedContent = JSON.parse(content);
        }
    } catch (e) {
        parsedContent = null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-gray-900/60 backdrop-blur-sm">
            <div
                className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col font-sans relative ring-1 ring-gray-900/5"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 md:p-8 border-b border-gray-100 flex justify-between items-start bg-white sticky top-0 z-10">
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 uppercase tracking-widest" style={{ fontFamily: 'Inter, sans-serif' }}>
                                {type}
                            </span>
                        </div>
                        <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {title}
                        </h2>
                        
                        <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-gray-500 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                            <div className="flex items-center gap-1.5">
                                <FiCalendar className="w-4 h-4 text-gray-400" />
                                <span>{formatDate(date)}</span>
                            </div>
                            <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                            <div className="flex items-center gap-1.5">
                                <FiUser className="w-4 h-4 text-gray-400" />
                                <span>{doctorName}</span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2.5 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-gray-700 -mr-2 -mt-2"
                    >
                        <FiX className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-gray-50/50">
                    <div className="max-w-none">
                        {parsedContent ? (
                            <div className="space-y-8" style={{ fontFamily: 'Inter, sans-serif' }}>
                                {parsedContent.mood && (
                                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                        <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Mood Assessment</h3>
                                        <p className="text-[16px] text-gray-800 font-medium capitalize">{parsedContent.mood}</p>
                                    </div>
                                )}
                                
                                {parsedContent.progress !== undefined && (
                                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                        <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Overall Progress</h3>
                                        <div className="flex items-center gap-4">
                                            <div className="flex-1 bg-gray-100 rounded-full h-2">
                                                <div className="bg-teal-500 h-2 rounded-full transition-all" style={{ width: `${(parsedContent.progress / 10) * 100}%` }}></div>
                                            </div>
                                            <span className="font-bold text-gray-900 text-sm">{parsedContent.progress}/10</span>
                                        </div>
                                    </div>
                                )}
                                
                                {parsedContent.observations && Array.isArray(parsedContent.observations) && parsedContent.observations.length > 0 && (
                                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                        <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Clinical Observations</h3>
                                        <ul className="space-y-2">
                                            {parsedContent.observations.map((obs: string, i: number) => (
                                                <li key={i} className="flex items-start gap-3 text-gray-700 text-[15px] leading-relaxed">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0 mt-2"></span>
                                                    {obs}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                
                                {parsedContent.diagnosis && (
                                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                        <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Primary Diagnosis</h3>
                                        <p className="text-gray-800 text-[15px] leading-relaxed whitespace-pre-wrap">{parsedContent.diagnosis}</p>
                                    </div>
                                )}

                                {parsedContent.summary && (
                                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                        <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Consultation Summary</h3>
                                        <p className="text-gray-800 text-[15px] leading-relaxed whitespace-pre-wrap">{parsedContent.summary}</p>
                                    </div>
                                )}
                                
                                {parsedContent.recommendations && (
                                    <div className="bg-teal-50/50 p-5 rounded-2xl border border-teal-100 shadow-sm">
                                        <h3 className="text-[11px] font-bold text-teal-600 uppercase tracking-widest mb-2">Doctor's Recommendations</h3>
                                        <p className="text-teal-900 text-[15px] leading-relaxed whitespace-pre-wrap font-medium">{parsedContent.recommendations}</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="bg-white p-6 md:p-8 rounded-2xl border border-gray-100 shadow-sm text-gray-800 text-[15px] leading-loose whitespace-pre-wrap" style={{ fontFamily: 'Inter, sans-serif' }}>
                                {content}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                {onDownload && (
                    <div className="p-4 md:p-6 border-t border-gray-100 bg-white flex justify-end shrink-0">
                        <button
                            onClick={onDownload}
                            className="flex items-center justify-center w-full md:w-auto gap-2 px-8 py-3.5 bg-gray-900 text-white font-bold rounded-xl hover:bg-teal-600 transition-colors shadow-sm text-[14px]"
                            style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                            <FiDownload className="w-4 h-4" />
                            Download Official PDF
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ViewContentModal;
