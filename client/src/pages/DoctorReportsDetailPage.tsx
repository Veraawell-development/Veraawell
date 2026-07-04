import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiDownload, FiArrowLeft, FiFile } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config/api';

interface Report {
  _id: string;
  title: string;
  reportType: string;
  content: string;
  createdAt: string;
  patientId: {
    firstName: string;
    lastName: string;
  }
}

const DoctorReportsDetailPage: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [patientName, setPatientName] = useState('');
  const navigate = useNavigate();
  const { patientId } = useParams();
  const { user } = useAuth();

  useEffect(() => {
    fetchPatientReports();
  }, [patientId, user]);

  const fetchPatientReports = async () => {
    if (!patientId || !user) return;

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API_BASE_URL}/session-tools/reports/patient/${patientId}`, {
        credentials: 'include',
        headers
      });

      if (!response.ok) throw new Error('Failed to fetch patient reports');
      const data = await response.json();
      const reportsArray = data.reports || [];

      setReports(reportsArray);
      if (reportsArray.length > 0 && reportsArray[0].patientId) {
        setPatientName(`${reportsArray[0].patientId.firstName || ''} ${reportsArray[0].patientId.lastName || ''}`.trim());
      }
    } catch (error) {
      console.error('Error fetching patient reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
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
            onClick={() => navigate('/doctor-reports')} 
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
            {patientName ? `${patientName}'s Reports` : 'Patient Reports'}
          </h1>
          <p className="text-[15px] text-gray-500 font-medium leading-relaxed max-w-2xl" style={{ fontFamily: 'Inter, sans-serif' }}>
            View all the generated reports for this patient.
          </p>
        </div>

        {reports.length === 0 ? (
          <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm p-16 text-center max-w-3xl mx-auto mt-4 shrink-0">
            <div className="w-16 h-16 bg-gray-50 border border-gray-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <FiDownload className="w-6 h-6 text-gray-400" />
            </div>
            <h3 className="text-[18px] font-bold text-gray-800 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
              No Reports Found
            </h3>
            <p className="text-gray-500 text-[14px] mb-8" style={{ fontFamily: 'Inter, sans-serif' }}>
              No reports have been generated for this patient yet.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2 pb-10 min-h-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-none">
              {reports.map((report) => (
                <div key={report._id} className="bg-white rounded-[20px] border border-gray-100 hover:border-teal-100 shadow-sm transition-all p-6 relative overflow-hidden group flex flex-col">
                  
                  <div className="flex justify-between items-start mb-5 pb-5 border-b border-gray-50">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-teal-50/50 rounded-xl text-teal-600 border border-teal-100/50 shrink-0">
                        <FiFile className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <h3 className="text-[15px] font-bold text-gray-800 tracking-tight group-hover:text-teal-600 transition-colors line-clamp-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                          {report.title}
                        </h3>
                        <p className="text-[12px] font-medium text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>Generated on {formatDate(report.createdAt)}</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-bold tracking-wide uppercase bg-gray-100 text-gray-600 border border-gray-200/50 shrink-0 ml-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {report.reportType}
                    </span>
                  </div>

                  <div className="mt-2 w-full flex-1 flex flex-col">
                    {(() => {
                      try {
                        const parsed = JSON.parse(report.content);
                        return (
                          <div className="flex flex-col gap-4 flex-1">
                            {/* Top Stats Grid */}
                            <div className="grid grid-cols-2 gap-3">
                              {parsed.mood && (
                                <div className="bg-gradient-to-br from-indigo-50 to-blue-50/50 p-3.5 rounded-2xl border border-indigo-100/50 flex flex-col justify-center">
                                  <span className="text-[9px] font-extrabold text-indigo-400 uppercase tracking-widest mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>Mood</span>
                                  <span className="text-[14px] font-bold text-indigo-900 capitalize" style={{ fontFamily: 'Inter, sans-serif' }}>{parsed.mood}</span>
                                </div>
                              )}
                              {parsed.progress && (
                                <div className="bg-gradient-to-br from-emerald-50 to-teal-50/50 p-3.5 rounded-2xl border border-emerald-100/50 flex flex-col justify-center">
                                  <span className="text-[9px] font-extrabold text-emerald-400 uppercase tracking-widest mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>Progress</span>
                                  <div className="flex items-end gap-1">
                                    <span className="text-[18px] font-black text-emerald-700 leading-none" style={{ fontFamily: 'Inter, sans-serif' }}>{parsed.progress}</span>
                                    <span className="text-[11px] font-bold text-emerald-500 mb-0.5" style={{ fontFamily: 'Inter, sans-serif' }}>/10</span>
                                  </div>
                                </div>
                              )}
                              {parsed.diagnosis && (
                                <div className="bg-gradient-to-br from-purple-50 to-fuchsia-50/50 p-3.5 rounded-2xl border border-purple-100/50 flex flex-col justify-center col-span-2">
                                  <span className="text-[9px] font-extrabold text-purple-400 uppercase tracking-widest mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>Diagnosis</span>
                                  <span className="text-[13px] font-bold text-purple-900 leading-snug line-clamp-2" style={{ fontFamily: 'Inter, sans-serif' }}>{parsed.diagnosis}</span>
                                </div>
                              )}
                            </div>

                            {/* Main Content Area */}
                            <div className="flex flex-col gap-3 flex-1">
                              {parsed.summary && (
                                <div className="bg-gray-50/80 p-4 rounded-2xl border border-gray-100 flex flex-col h-full">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-5 h-5 rounded-full bg-gray-200/50 flex items-center justify-center">
                                      <svg className="w-2.5 h-2.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h7" /></svg>
                                    </div>
                                    <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest" style={{ fontFamily: 'Inter, sans-serif' }}>Summary</span>
                                  </div>
                                  <p className="text-[13px] leading-relaxed text-gray-700 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>{parsed.summary}</p>
                                </div>
                              )}
                              {parsed.recommendations && (
                                <div className="bg-amber-50/30 p-4 rounded-2xl border border-amber-100/50 flex flex-col h-full">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center">
                                      <svg className="w-2.5 h-2.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                                    </div>
                                    <span className="text-[10px] font-extrabold text-amber-600 uppercase tracking-widest" style={{ fontFamily: 'Inter, sans-serif' }}>Recommendations</span>
                                  </div>
                                  <p className="text-[13px] leading-relaxed text-amber-900/80 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>{parsed.recommendations}</p>
                                </div>
                              )}
                            </div>

                            {/* Observations */}
                            {parsed.observations && Array.isArray(parsed.observations) && parsed.observations.length > 0 && (
                              <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 w-full mt-auto">
                                <div className="flex items-center gap-2 mb-3">
                                  <div className="w-5 h-5 rounded-full bg-teal-50 flex items-center justify-center border border-teal-100">
                                    <svg className="w-2.5 h-2.5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                  </div>
                                  <span className="text-[10px] font-extrabold text-teal-700 uppercase tracking-widest" style={{ fontFamily: 'Inter, sans-serif' }}>Observations</span>
                                </div>
                                <div className="grid grid-cols-1 gap-2">
                                  {parsed.observations.map((obs: string, idx: number) => (
                                    <div key={idx} className="flex items-start gap-2 bg-white p-2.5 rounded-xl border border-gray-100 shadow-sm">
                                      <div className="w-4 h-4 rounded-full bg-teal-50 flex items-center justify-center shrink-0 mt-0.5">
                                        <span className="text-[9px] font-bold text-teal-600">{idx + 1}</span>
                                      </div>
                                      <span className="text-[12px] font-semibold text-gray-700 leading-snug" style={{ fontFamily: 'Inter, sans-serif' }}>{obs}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      } catch (e) {
                        return (
                          <div className="bg-gray-50/50 p-5 rounded-2xl border border-gray-100 flex-1">
                            <p className="whitespace-pre-wrap text-[13px] leading-relaxed font-medium text-gray-700 m-0" style={{ fontFamily: 'Inter, sans-serif' }}>{report.content}</p>
                          </div>
                        );
                      }
                    })()}
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

export default DoctorReportsDetailPage;
