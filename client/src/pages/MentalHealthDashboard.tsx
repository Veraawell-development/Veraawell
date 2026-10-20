import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MENTAL_HEALTH_TESTS } from '../data/mentalHealthTests';
import { API_CONFIG } from '../config/api';
import { 
  FiCloudRain, FiWind, FiZap, FiAlertTriangle, 
  FiUnlock, FiUsers, FiHeart, FiToggleLeft, 
  FiTarget, FiSmile, FiArrowRight, FiArrowLeft, FiCheckCircle, FiList, FiPhone
} from 'react-icons/fi';
import { IoCheckmarkCircle } from 'react-icons/io5';
import { useQuery } from '@tanstack/react-query';
import MoodHistoryCard from '../components/MoodHistoryCard';
import EmergencyHotlineModal from '../components/EmergencyHotlineModal';
import { severityLabel, severityStyle } from '../utils/severityStyle';

const iconMap: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
    'depression': { icon: <FiCloudRain size={20} />, color: 'text-gray-900', bg: 'bg-gray-100' },
    'anxiety': { icon: <FiWind size={20} />, color: 'text-gray-900', bg: 'bg-gray-100' },
    'adhd': { icon: <FiZap size={20} />, color: 'text-gray-900', bg: 'bg-gray-100' },
    'ptsd': { icon: <FiAlertTriangle size={20} />, color: 'text-gray-900', bg: 'bg-gray-100' },
    'addiction': { icon: <FiUnlock size={20} />, color: 'text-gray-900', bg: 'bg-gray-100' },
    'social-anxiety': { icon: <FiUsers size={20} />, color: 'text-gray-900', bg: 'bg-gray-100' },
    'post-partum': { icon: <FiHeart size={20} />, color: 'text-gray-900', bg: 'bg-gray-100' },
    'bipolar': { icon: <FiToggleLeft size={20} />, color: 'text-gray-900', bg: 'bg-gray-100' },
    'gambling': { icon: <FiTarget size={20} />, color: 'text-gray-900', bg: 'bg-gray-100' },
    'eating-disorder': { icon: <FiSmile size={20} />, color: 'text-gray-900', bg: 'bg-gray-100' },
};

const MentalHealthDashboard: React.FC = () => {
    const navigate = useNavigate();
    const [helpOpen, setHelpOpen] = useState(false);

    const { data: latestScores = {}, isError, refetch, isFetching } = useQuery({
        queryKey: ['patient', 'assessments'],
        queryFn: async () => {
            const response = await fetch(`${API_CONFIG.BASE_URL}/assessments`, {
                credentials: 'include'
            });

            if (!response.ok) throw new Error('Failed to fetch assessments');
            
            const data = await response.json();
            const scoresMap: Record<string, any> = {};
            
            if (data.success && Array.isArray(data.assessments)) {
                data.assessments.forEach((assessment: any) => {
                    if (!scoresMap[assessment.testType]) {
                        scoresMap[assessment.testType] = {
                            _id: assessment.testType,
                            latestScore: assessment.scores?.total || 0,
                            latestSeverity: assessment.scores?.severity || 'minimal',
                            latestDate: assessment.completedAt
                        };
                    }
                });
            }
            return scoresMap;
        }
    });

    const testCards = Object.values(MENTAL_HEALTH_TESTS);

    return (
        <div className="min-h-screen bg-[var(--bg)] font-sans selection:bg-teal-100 pb-12 pt-32">
            <div className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 md:py-10">
                <div className="mb-8 flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="max-w-2xl relative">
                        <button 
                            onClick={() => navigate('/patient-dashboard')} 
                            className="flex items-center gap-2 text-[13px] font-semibold text-gray-500 hover:text-teal-600 transition-colors mb-5 group"
                            aria-label="Back to Dashboard"
                            style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                            <FiArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                            Back to Dashboard
                        </button>
                        
                        <h1 className="page-title mb-3">
                            Clinical Assessments
                        </h1>
                        <p className="text-[15px] text-gray-500 font-medium leading-relaxed max-w-2xl" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Standardised screening questionnaires to track your wellbeing over time. Your results are private: only you can see them.
                        </p>
                    </div>

                    <div className="shrink-0 pt-2 md:pt-10 md:mt-2 flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => setHelpOpen(true)}
                            className="flex items-center gap-2 text-[13px] font-semibold text-red-700 bg-red-50 border border-red-100 hover:bg-red-100 px-4 py-2 rounded-full transition-all"
                            style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                            <FiPhone className="w-4 h-4" aria-hidden="true" />
                            Need help now?
                        </button>
                        <button 
                            onClick={() => navigate('/my-tests')}
                            className="flex items-center gap-2 text-[13px] font-semibold text-teal-700 bg-teal-50 border border-teal-100 hover:bg-teal-100 hover:border-teal-200 px-4 py-2 rounded-full transition-all shadow-sm"
                            style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                            <FiList className="w-4 h-4" />
                            View History
                        </button>
                    </div>
                </div>

                <MoodHistoryCard />

                {isError && (
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3" role="alert">
                        <p className="text-[13px] font-medium text-amber-900" style={{ fontFamily: 'Inter, sans-serif' }}>
                            We couldn't load your past results. You can still take any test.
                        </p>
                        <button
                            onClick={() => refetch()}
                            disabled={isFetching}
                            className="text-[13px] font-semibold text-amber-900 underline disabled:opacity-60"
                            style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                            {isFetching ? 'Trying…' : 'Try again'}
                        </button>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {testCards.map((test) => {
                        const latestScore = latestScores[test.id];
                        // The stored severity, not one recomputed here from
                        // the total: the server scored it, and for the
                        // addiction test the bands are not on the total.
                        const severity = latestScore?.latestSeverity || null;
                        const maxScore = test.scoring.branchMax ? null : test.scoring.maxScore;
                        const iconData = iconMap[test.id] || iconMap['depression'];
                        const open = () => navigate(`/mental-health/${test.id}`);

                        return (
                            <div
                                key={test.id}
                                role="link"
                                tabIndex={0}
                                aria-label={`${latestScore ? 'Retake' : 'Start'} the ${test.name}`}
                                className="bg-white rounded-[16px] border border-gray-200 shadow-sm hover:border-teal-600 hover:shadow-md transition-all duration-200 flex flex-col group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                                onClick={open}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
                            >
                                <div className="p-6 flex-1 flex flex-col">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconData.bg} ${iconData.color}`}>
                                            {iconData.icon}
                                        </div>
                                        {latestScore && (
                                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 rounded-md border border-gray-200">
                                                <FiCheckCircle className="w-3.5 h-3.5 text-gray-400" />
                                                <span className="text-[11px] font-semibold text-gray-600 tracking-wide uppercase" style={{ fontFamily: 'Inter, sans-serif' }}>Completed</span>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <h3 className="text-[16px] font-bold text-gray-800 tracking-tight mb-1 truncate" style={{ fontFamily: 'Inter, sans-serif' }}>
                                        {test.name}
                                    </h3>

                                    {/* Always shown, two lines high, so every card's
                                        footer (and its divider) sits at the same height
                                        whether or not the test has been taken. */}
                                    <p className="text-[14px] text-gray-500 font-medium leading-relaxed line-clamp-2 min-h-[46px] mb-6" style={{ fontFamily: 'Inter, sans-serif' }}>
                                        {test.description}
                                    </p>

                                    <div className="mt-auto">
                                        {latestScore ? (
                                            <div className="pt-5 h-[76px] border-t border-gray-100 flex items-center justify-between">
                                                <div>
                                                    <div className="flex items-baseline gap-1 mb-0.5">
                                                        <span className="text-2xl font-bold tracking-tight text-gray-800" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                            {latestScore.latestScore}
                                                        </span>
                                                        {maxScore && (
                                                            <span className="text-[13px] font-semibold text-gray-400" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                                / {maxScore}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-[13px] font-medium" style={{ color: severityStyle(severity).text, fontFamily: 'Inter, sans-serif' }}>
                                                        {severity ? severityLabel(severity) : '—'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-teal-600 text-[13px] font-semibold group-hover:translate-x-1 transition-transform" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                    Retest <FiArrowRight className="w-4 h-4" />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="pt-5 h-[76px] border-t border-gray-100 flex items-center justify-between">
                                                <div className="flex items-center gap-3 text-[12px] font-medium text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                    <span className="flex items-center gap-1.5">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                                                        {test.questionCount} Qs
                                                    </span>
                                                    <span className="flex items-center gap-1.5">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                                                        {test.estimatedTime}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-gray-800 text-[13px] font-semibold group-hover:text-teal-600 group-hover:translate-x-1 transition-transform" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                    Start <FiArrowRight className="w-4 h-4" />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            <EmergencyHotlineModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
        </div>
    );
};

export default MentalHealthDashboard;
