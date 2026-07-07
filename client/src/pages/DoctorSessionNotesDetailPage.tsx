import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft, FiActivity } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '../config/api';

interface SessionNote {
  _id: string;
  content: string;
  mood?: string;
  createdAt: string;
  sessionId: {
    sessionDate?: string;
    sessionTime?: string;
  };
  patientId: {
    firstName: string;
    lastName: string;
  }
}

const DoctorSessionNotesDetailPage: React.FC = () => {
  const [patientName, setPatientName] = useState('');
  const navigate = useNavigate();
  const { patientId } = useParams();
  const { user } = useAuth();

  const { data: notes = [], isLoading: loading } = useQuery<SessionNote[]>({
    queryKey: ['doctor', 'notes', 'patient', patientId],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {};
      const response = await fetch(`${API_BASE_URL}/session-tools/notes/patient/${patientId}`, {
        credentials: 'include',
        headers
      });
      if (!response.ok) throw new Error('Failed to fetch patient notes');
      const data = await response.json();
      return data.notes || [];
    },
    enabled: !!patientId && !!user
  });

  useEffect(() => {
    if (notes.length > 0 && notes[0].patientId) {
      setPatientName(`${notes[0].patientId.firstName || ''} ${notes[0].patientId.lastName || ''}`.trim());
    }
  }, [notes]);

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="h-[calc(100vh-80px)] flex items-center justify-center bg-[#FAFAFA]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 text-[13px] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>Loading session notes...</p>
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
            onClick={() => navigate('/doctor-session-notes')} 
            className="flex items-center gap-2 text-[13px] font-semibold text-gray-500 hover:text-teal-600 transition-colors mb-5 group"
            aria-label="Back to All Patients"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to All Patients
          </button>

          <h1 className="text-[32px] md:text-[36px] font-extrabold text-gray-800 tracking-tight mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
            {patientName ? `${patientName}'s Notes` : 'Patient Notes'}
          </h1>
          <p className="text-[15px] text-gray-500 font-medium leading-relaxed max-w-2xl" style={{ fontFamily: 'Inter, sans-serif' }}>
            Review detailed session notes and observations for this patient.
          </p>
        </div>

        {notes.length === 0 ? (
          <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm p-16 text-center max-w-3xl mx-auto mt-4 shrink-0">
            <div className="w-16 h-16 bg-gray-50 border border-gray-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-[18px] font-bold text-gray-800 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
              No Notes Found
            </h3>
            <p className="text-gray-500 text-[14px] mb-8" style={{ fontFamily: 'Inter, sans-serif' }}>
              No session notes found for this patient.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2 pb-10 min-h-0">
            <div className="space-y-5 max-w-4xl">
              {notes.map((note) => (
                <div
                  key={note._id}
                  className="bg-white rounded-[16px] border border-gray-100 hover:border-teal-100 shadow-sm transition-all overflow-hidden p-6 flex flex-col"
                >
                  <div className="flex justify-between items-start mb-5 pb-5 border-b border-gray-50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
                        <FiActivity className="w-4 h-4 text-teal-600" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <h3 className="text-[14px] font-bold text-gray-800 tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
                          Session Date
                        </h3>
                        <p className="text-[12px] font-medium text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
                          {formatDate(note.createdAt)}
                        </p>
                      </div>
                    </div>
                    {note.mood && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold tracking-wide uppercase bg-purple-50 text-purple-700 border border-purple-100" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Mood: {note.mood}
                      </span>
                    )}
                  </div>
                  
                  <div className="prose prose-sm max-w-none">
                    <p className="whitespace-pre-wrap text-[14px] leading-relaxed font-medium text-gray-600 bg-gray-50/50 p-5 rounded-xl border border-gray-100" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {note.content}
                    </p>
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

export default DoctorSessionNotesDetailPage;
