import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import DoctorCard from '../components/DoctorCard';
import { API_CONFIG, API_BASE_URL } from '../config/api';
import { useDataSocket } from '../hooks/useDataSocket';
import LeafDecor from '../components/ui/LeafDecor';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDoctorAccentColor } from '../utils/doctorColor';
import { doctorDisplayName, experienceLabel } from '../utils/doctorName';
import { startingPrice } from '../utils/sessionPricing';
import type { DoctorPricing } from '../utils/sessionPricing';

interface Doctor {
  _id: string;
  userId: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    gender?: string;
  };
  specialization: string[];
  experience: number;
  qualification: string[];
  languages: string[];
  treatsFor: string[];
  pricing: DoctorPricing;
  profileImage: string;
  bio: string;
  isOnline: boolean;
  rating: {
    average: number;
    totalReviews: number;
  };
  gender?: string;
}

const ChooseProfessionalPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // "All" unless the patient asked to talk to someone now. "Available now"
  // was the default for every way in — and is empty whenever nobody happens
  // to be online, which read as "no therapists".
  const initialViewMode = (location.state as any)?.bookingType === 'now' ? 'online' : 'all';
  const [viewMode, setViewMode] = useState<'online' | 'all'>(initialViewMode);
  const serviceType = (location.state as any)?.serviceType || 'General';

  //  REAL-TIME: Connect to data socket
  const { socket } = useDataSocket();

  const { data: doctors = [], isLoading: doctorsLoading, error: doctorsError } = useQuery<Doctor[]>({
    queryKey: ['doctors', 'all'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/sessions/doctors`);
      if (!response.ok) throw new Error('Failed to fetch doctors');
      return response.json();
    }
  });

  const { data: onlineDoctors = [], isLoading: onlineDoctorsLoading } = useQuery<any[]>({
    queryKey: ['doctors', 'online'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/doctor-status/online-doctors`);
      if (!response.ok) throw new Error('Failed to fetch online doctors');
      const data = await response.json();
      return data.doctors || [];
    }
  });

  const { data: previousDoctorIds = new Set<string>() } = useQuery({
    queryKey: ['doctors', 'previous'],
    queryFn: async () => {
      const response = await fetch(`${API_CONFIG.BASE_URL}/sessions/my-doctors`, {
        credentials: 'include'
      });
      if (!response.ok) return new Set<string>();
      const data = await response.json();
      return new Set<string>(data.map((d: any) => d._id));
    }
  });

  const loading = doctorsLoading || onlineDoctorsLoading;
  // The live state of each doctor, from the online list (which counts only
  // doctors actually connected, and flags those in a session).
  const liveStatus = (userId: string): 'online' | 'busy' | 'offline' => {
    const entry = onlineDoctors.find((d: any) => d._id === userId);
    if (!entry) return 'offline';
    return entry.busy ? 'busy' : 'online';
  };
  const error = doctorsError ? 'Failed to load doctors. Please try again.' : null;

  //  REAL-TIME: Listen for doctor status changes
  useEffect(() => {
    if (!socket) return;

    const onStatusChange = () => {
      queryClient.invalidateQueries({ queryKey: ['doctors', 'online'] });
    };
    socket.on('doctor:status-change', onStatusChange);

    return () => {
      // With the handler: the /data socket is shared app-wide, and a bare
      // off(event) would also remove DoctorDashboard's listener.
      socket.off('doctor:status-change', onStatusChange);
    };
  }, [socket, queryClient]);

  const handleBookSession = (doctorId: string, isImmediate: boolean = false) => {
    navigate(`/doctor/${doctorId}`, {
      state: {
        serviceType,
        bookingType: isImmediate ? 'immediate' : 'scheduled'
      }
    });
  };

  const getDoctorBgColor = getDoctorAccentColor;


  // Get current doctors based on view mode and sort them by service preference.
  // A copy: sort() in place reordered the query cache itself.
  const currentDoctors = [...(viewMode === 'online' ? onlineDoctors : doctors)].sort((a: any, b: any) => {
    if (serviceType === 'General') return 0;

    const aTreats = (a.treatsFor || []).map((s: string) => s.toLowerCase());
    const bTreats = (b.treatsFor || []).map((s: string) => s.toLowerCase());
    const lowerService = serviceType.toLowerCase();

    const aMatches = aTreats.includes(lowerService);
    const bMatches = bTreats.includes(lowerService);

    if (aMatches && !bMatches) return -1;
    if (!aMatches && bMatches) return 1;
    return 0;
  });

  const currentCount = currentDoctors.length;

  return (
    <div className="h-[100dvh] pt-16 md:pt-[80px] bg-[var(--bg-2)] flex flex-col overflow-hidden relative box-border">
      {/* Background Ornaments */}
      <LeafDecor 
        style={{ 
          position: 'absolute', 
          top: '-5%', 
          left: '-10%', 
          width: '500px', 
          height: '500px', 
          opacity: 0.6, 
          transform: 'rotate(-20deg)', 
          zIndex: 0 
        }} 
      />
      <div 
        className="absolute top-[20%] right-[-10%] w-[600px] h-[600px] rounded-full blur-[120px] pointer-events-none z-0" 
        style={{ background: 'radial-gradient(circle, rgba(107, 168, 136, 0.15), transparent 60%)' }} 
      />

      {/* Hero Section */}
      <div className="shrink-0 relative z-10">
        <div className="max-w-6xl mx-auto px-6 pt-12 pb-6 relative flex flex-col items-center">
          {/* Back Button */}
          <button
            onClick={() => navigate('/patient-dashboard')}
            className="absolute left-6 top-12 flex items-center gap-3 text-[11px] font-bold tracking-[0.15em] uppercase transition-all duration-300 hover:-translate-x-1"
            style={{ color: 'var(--teal)' }}
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300"
              style={{ background: 'rgba(0,151,178,0.1)', border: '1px solid rgba(0,151,178,0.2)' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </div>
            Back to Dashboard
          </button>
          
          <div className="text-center max-w-2xl mt-14 md:mt-4">
            <h1 
              className="text-4xl md:text-5xl font-normal mb-4 text-center leading-tight tracking-tight" 
              style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}
            >
              Find Your <em style={{ color: 'var(--teal)' }}>Therapist</em>
            </h1>
            <p className="text-[16px] text-gray-500 mb-8 mx-auto max-w-md" style={{ color: 'var(--text-2)' }}>
              Choose a professional who understands you. Start with a short 20-minute session to find the right fit.
            </p>

            {/* Discovery Session Badge */}
            <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full"
              style={{ background: 'rgba(107,168,136,0.1)', border: '1px solid rgba(107,168,136,0.2)' }}
            >
              <svg className="w-4 h-4" style={{ color: 'var(--sage)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-[13px] font-semibold" style={{ color: 'var(--teal-dark)' }}>
                20-minute discovery sessions
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Toggle Section */}
      <div className="shrink-0 relative z-20 pb-4">
        <div className="max-w-[1200px] mx-auto px-6 flex justify-center">
          <div 
            className="inline-flex rounded-full p-1.5 shadow-sm"
            style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.8)', backdropFilter: 'blur(8px)' }}
          >
            <button
              onClick={() => setViewMode('online')}
              className={`px-8 py-2.5 rounded-full font-bold text-[13px] transition-all duration-300 ${viewMode === 'online'
                ? 'shadow-md'
                : 'bg-transparent opacity-60 hover:opacity-100'
                }`}
              style={{ 
                color: viewMode === 'online' ? '#fff' : 'var(--teal-dark)',
                background: viewMode === 'online' ? 'var(--teal)' : 'transparent'
              }}
            >
              Available Now
            </button>
            <button
              onClick={() => setViewMode('all')}
              className={`px-8 py-2.5 rounded-full font-bold text-[13px] transition-all duration-300 ${viewMode === 'all'
                ? 'shadow-md'
                : 'bg-transparent opacity-60 hover:opacity-100'
                }`}
              style={{ 
                color: viewMode === 'all' ? '#fff' : 'var(--teal-dark)',
                background: viewMode === 'all' ? 'var(--teal)' : 'transparent'
              }}
            >
              All Available
            </button>
          </div>
        </div>
      </div>

      {/* Unified Doctors Section */}
      <div className="flex-1 overflow-y-auto pb-12 relative z-10">
        <div className="max-w-6xl mx-auto px-6 pt-6">
          {/* Section Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <h2 className="text-[20px] font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
              {viewMode === 'online' ? 'Available Now' : 'All Professionals'}
            </h2>
            {viewMode === 'online' && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: 'var(--sage)' }}></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: 'var(--sage)' }}></span>
              </span>
            )}
          </div>
          {!loading && !error && (
            <span className="text-[13px] font-medium" style={{ color: 'var(--text-2)' }}>
              {currentCount} {viewMode === 'online' ? 'online' : 'available'}
            </span>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 mb-3" style={{ borderColor: 'var(--teal)' }}></div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>Loading professionals...</p>
          </div>
        ) : error ? (
          <div className="text-center py-16 rounded-3xl" style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.9)' }}>
            <p className="text-red-600 mb-4 text-sm font-medium">{error}</p>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['doctors'] })}
              className="px-6 py-2.5 text-white text-sm font-semibold rounded-full transition-colors shadow-sm"
              style={{ background: 'var(--teal)' }}
            >
              Try Again
            </button>
          </div>
        ) : currentDoctors.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {viewMode === 'online' ? (
              // Online doctors view
              currentDoctors.map((doctor: any) => {
                // The directory only lists doctors with a published calendar;
                // an instant session doesn't need one, so fall back to the
                // public profile the online-doctors response now carries.
                const fullDoctorData: Doctor | undefined = doctors.find((d: Doctor) => d.userId._id === doctor._id)
                  || (doctor.profile
                    ? ({
                        ...doctor.profile,
                        userId: { _id: doctor._id, firstName: doctor.firstName, lastName: doctor.lastName, email: '' },
                        isOnline: true
                      } as Doctor)
                    : undefined);

                if (fullDoctorData) {
                  // A therapist in a session can't take an instant call: the
                  // card AND the profile it opens offer a time instead — the
                  // profile used to open as an instant booking the server
                  // then refused.
                  const bookingType = doctor.busy ? 'scheduled' : 'immediate';
                  return (
                      <DoctorCard
                        key={doctor._id}
                        name={doctorDisplayName(fullDoctorData.userId.firstName, fullDoctorData.userId.lastName)}
                        experience={experienceLabel(fullDoctorData.experience) || '—'}
                        qualification={fullDoctorData.qualification.join(', ') || 'Not specified'}
                        startingPrice={startingPrice(fullDoctorData.pricing)}
                        language={fullDoctorData.languages.join(', ') || 'Not specified'}
                        treatsFor={fullDoctorData.treatsFor.join(', ') || 'General'}
                        imageSrc={fullDoctorData.profileImage || ''}
                        bgColor={getDoctorBgColor(fullDoctorData.userId._id)}
                        rating={fullDoctorData.rating}
                        isPrevious={previousDoctorIds.has(fullDoctorData._id)}
                        onViewProfile={() => {
                          navigate(`/doctor/${fullDoctorData.userId._id}`, { state: { serviceType, bookingType } });
                        }}
                        onBookSession={() => {
                          navigate(`/doctor/${fullDoctorData.userId._id}`, { state: { serviceType, bookingType } });
                        }}
                        status={doctor.busy ? 'busy' : 'online'}
                        ctaLabel={doctor.busy ? 'Book a time →' : 'Talk now →'}
                      />
                  );
                }

                // Fallback for doctors without full data
                return (
                  <div
                    key={doctor._id}
                    className="group rounded-3xl p-6 transition-all duration-300 flex flex-col h-full relative overflow-hidden"
                    style={{
                      background: 'rgba(255, 255, 255, 0.7)',
                      border: '1px solid rgba(255, 255, 255, 0.8)',
                      backdropFilter: 'blur(16px)',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.02)'
                    }}
                  >
                    {/* Online Badge */}
                    <div className="flex justify-end mb-4 relative z-10">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                        style={{ background: 'rgba(107, 168, 136, 0.1)', border: '1px solid rgba(107, 168, 136, 0.2)' }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--sage)' }}></div>
                        <span className="text-[11px] font-bold tracking-wide uppercase" style={{ color: 'var(--sage)' }}>
                          {doctor.busy ? 'In a session' : 'Online'}
                        </span>
                      </div>
                    </div>

                    {/* Doctor Info */}
                    <div className="flex flex-col items-center flex-1 relative z-10">
                      <div
                        className="w-24 h-24 mb-5 rounded-full flex items-center justify-center text-white text-3xl font-display shadow-lg"
                        style={{ backgroundColor: getDoctorBgColor(doctor._id) }}
                      >
                        {(doctor.firstName || '?').charAt(0)}{(doctor.lastName || '').charAt(0)}
                      </div>
                      <h3 className="text-xl font-semibold mb-1 text-center" style={{ color: 'var(--text)' }}>
                        {doctorDisplayName(doctor.firstName, doctor.lastName)}
                      </h3>
                      <p className="text-[14px] mb-8 text-center truncate w-full" style={{ color: 'var(--text-2)' }}>
                        {doctor.busy ? 'In a session right now' : 'Available for an instant session'}
                      </p>

                      <div className="mt-auto w-full">
                        <button
                          onClick={() => handleBookSession(doctor._id, !doctor.busy)}
                          className="w-full px-4 py-3 text-white text-[14px] font-bold rounded-full transition-all duration-300 shadow-md hover:-translate-y-1"
                          style={{ background: 'var(--teal)', boxShadow: '0 8px 20px rgba(0,151,178,0.2)' }}
                        >
                          {doctor.busy ? 'Book a time' : 'Talk now'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              // All doctors view
              currentDoctors.map((doctor: Doctor) => {
                const status = liveStatus(doctor.userId._id);
                // Online and free: the card offers an instant session, as the
                // "Available now" tab does; otherwise a time.
                const bookingType = status === 'online' ? 'immediate' : 'scheduled';
                const open = () => navigate(`/doctor/${doctor.userId._id}`, { state: { serviceType, bookingType: 'scheduled' } });
                return (
                  <DoctorCard
                    key={doctor._id}
                    name={doctorDisplayName(doctor.userId.firstName, doctor.userId.lastName)}
                    experience={experienceLabel(doctor.experience) || '—'}
                    qualification={doctor.qualification.join(', ')}
                    startingPrice={startingPrice(doctor.pricing)}
                    language={doctor.languages.join(', ')}
                    treatsFor={doctor.treatsFor.join(', ')}
                    imageSrc={doctor.profileImage || ''}
                    bgColor={getDoctorBgColor(doctor.userId._id)}
                    rating={doctor.rating}
                    isPrevious={previousDoctorIds.has(doctor._id)}
                    status={status}
                    onViewProfile={open}
                    onBookSession={bookingType === 'immediate'
                      ? () => navigate(`/doctor/${doctor.userId._id}`, { state: { serviceType, bookingType } })
                      : open}
                    ctaLabel={bookingType === 'immediate' ? 'Talk now →' : undefined}
                  />
                );
              })
            )}
          </div>
        ) : (
          <div className="text-center py-20 rounded-3xl" style={{ background: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(0,0,0,0.1)' }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(0,151,178,0.05)' }}>
              <svg className="w-8 h-8 opacity-50" style={{ color: 'var(--teal)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p className="text-[15px] font-semibold mb-1" style={{ color: 'var(--dark-text)' }}>
              {viewMode === 'online' ? 'No professionals online' : 'No professionals available'}
            </p>
            <p className="text-[13px]" style={{ color: 'var(--dark-text-2)' }}>Please check back later</p>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default ChooseProfessionalPage;
