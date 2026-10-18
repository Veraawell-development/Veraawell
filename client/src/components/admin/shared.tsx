import React from 'react';
import { FiX } from 'react-icons/fi';

export const ApprovalBadge: React.FC<{ status: string }> = ({ status }) => {
  if (status === 'approved') {
    return <span className="inline-flex items-center px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-medium border border-emerald-200">Approved</span>;
  }
  if (status === 'pending') {
    return <span className="inline-flex items-center px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[10px] font-medium border border-amber-200">Pending</span>;
  }
  if (status === 'rejected') {
    return <span className="inline-flex items-center px-1.5 py-0.5 bg-red-50 text-red-700 rounded-full text-[10px] font-medium border border-red-200">Rejected</span>;
  }
  return null;
};

export interface ViewedDocument {
  url: string;
  fileName: string;
  fileType: string;
}

/** Full-screen preview of a doctor's uploaded document. */
export const DocumentViewer: React.FC<{ document: ViewedDocument | null; onClose: () => void }> = ({ document: doc, onClose }) => {
  if (!doc) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full h-full max-w-5xl mx-auto p-4 flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4 text-white">
          <h3 className="text-sm font-semibold truncate max-w-2xl">{doc.fileName}</h3>
          <div className="flex items-center gap-3">
            <a
              href={doc.url}
              download={doc.fileName}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium"
            >
              Download
            </a>
            <button type="button" aria-label="Close" onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
              <FiX size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center rounded-2xl overflow-hidden bg-white">
          {doc.fileType === 'application/pdf' ? (
            <iframe
              src={`https://docs.google.com/viewer?url=${encodeURIComponent(doc.url)}&embedded=true`}
              className="w-full h-full"
              title={doc.fileName}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-4">
              <img src={doc.url} alt={doc.fileName} className="max-w-full max-h-full object-contain" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
