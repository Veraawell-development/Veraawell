import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiUser } from 'react-icons/fi';
import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '../config/api';

interface Patient {
  _id: string;
  name: string;
  occupation: string;
  issue: string;
  totalSessions: number;
  email?: string;
}

const PatientDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: patients = [], isLoading: loading } = useQuery({
    queryKey: ['doctor', 'patients'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/patients/doctor-patients`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json();
    }
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
          <p className="text-gray-500 text-[13px] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>Loading patient details...</p>
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
            Patient Details
          </h1>
          <p className="text-[15px] text-gray-500 font-medium leading-relaxed max-w-2xl" style={{ fontFamily: 'Inter, sans-serif' }}>
            View information and statistics for all your registered patients.
          </p>
        </div>

        {patients.length === 0 ? (
          <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm p-16 text-center max-w-3xl mx-auto mt-4 shrink-0">
            <div className="w-16 h-16 bg-gray-50 border border-gray-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h3 className="text-[18px] font-bold text-gray-800 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
              No Patients Found
            </h3>
            <p className="text-gray-500 text-[14px] mb-8" style={{ fontFamily: 'Inter, sans-serif' }}>
              Your patient list will appear here once you have sessions.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2 pb-10 min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {patients.map((patient: Patient) => (
                <div
                  key={patient._id}
                  className="group bg-white rounded-[16px] border border-gray-100 hover:border-teal-200 shadow-sm hover:shadow-md transition-all overflow-hidden p-6 flex flex-col cursor-pointer"
                >
                  <div className="flex justify-between items-start mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
                        <span className="text-[14px] font-bold text-teal-700 tracking-wider">
                           {getInitials(patient.name)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <h3 className="text-[16px] font-bold text-gray-800 tracking-tight line-clamp-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                          {patient.name}
                        </h3>
                        {patient.occupation && patient.occupation !== 'Not specified' && (
                          <p className="text-[13px] font-medium text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {patient.occupation}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4 mb-2">
                    <div className="bg-gray-50/50 p-4 rounded-xl border border-gray-100">
                      <div className="flex flex-col gap-1 mb-3">
                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider" style={{ fontFamily: 'Inter, sans-serif' }}>Primary Issue</span>
                        <span className="text-[14px] font-medium text-gray-700" style={{ fontFamily: 'Inter, sans-serif' }}>{patient.issue || 'Not specified'}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider" style={{ fontFamily: 'Inter, sans-serif' }}>Total Sessions</span>
                        <span className="text-[15px] font-bold text-teal-600" style={{ fontFamily: 'Inter, sans-serif' }}>{patient.totalSessions}</span>
                      </div>
                    </div>
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

export default PatientDetailsPage;
