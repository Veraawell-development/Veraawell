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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div
                className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-white sticky top-0 z-10">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 uppercase tracking-wide">
                                {type}
                            </span>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 leading-tight" style={{ fontFamily: 'Bree Serif, serif' }}>
                            {title}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
                    >
                        <FiX className="w-6 h-6" />
                    </button>
                </div>

                {/* Meta Info */}
                <div className="px-6 py-4 bg-gray-50 flex flex-wrap gap-6 border-b border-gray-100">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                        <FiCalendar className="w-4 h-4 text-teal-600" />
                        <span style={{ fontFamily: 'Inter, sans-serif' }}>{formatDate(date)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                        <FiUser className="w-4 h-4 text-teal-600" />
                        <span style={{ fontFamily: 'Inter, sans-serif' }}>{doctorName}</span>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8">
                    <div className="prose prose-teal max-w-none">
                        <div
                            className="text-gray-800 text-base leading-relaxed whitespace-pre-wrap"
                            style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                            {content}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                {onDownload && (
                    <div className="p-6 border-t border-gray-100 bg-white flex justify-end">
                        <button
                            onClick={onDownload}
                            className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 transition-colors shadow-sm"
                            style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                            <FiDownload className="w-5 h-5" />
                            Download PDF
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ViewContentModal;
