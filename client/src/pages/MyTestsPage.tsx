import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MENTAL_HEALTH_TESTS } from '../data/mentalHealthTests';
import { API_CONFIG } from '../config/api';
import { FiArrowLeft, FiChevronRight } from 'react-icons/fi';

const MyTestsPage: React.FC = () => {
    const navigate = useNavigate();

    const [assessments, setAssessments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState<string>('all');

    useEffect(() => {
        fetchAssessments();
    }, [filterType]);

    const fetchAssessments = async () => {
        try {
            setLoading(true);
            const url = filterType === 'all'
                ? `${API_CONFIG.BASE_URL}/assessments`
                : `${API_CONFIG.BASE_URL}/assessments?testType=${filterType}`;

            const response = await fetch(url, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setAssessments(data.assessments || []);
            }
        } catch (error) {
            console.error('Error fetching assessments:', error);
        } finally {
            setLoading(false);
        }
    };

    const getSeverityStyle = (severity: string) => {
        switch (severity) {
            case 'minimal': return { bg: 'bg-[#ECFDF5]', text: 'text-[#059669]', dot: 'bg-[#059669]' };
            case 'mild': return { bg: 'bg-[#FEF3C7]', text: 'text-[#D97706]', dot: 'bg-[#D97706]' };
            case 'moderate': return { bg: 'bg-[#FFF7ED]', text: 'text-[#EA580C]', dot: 'bg-[#EA580C]' };
            case 'moderately-severe': return { bg: 'bg-[#FEF2F2]', text: 'text-[#DC2626]', dot: 'bg-[#DC2626]' };
            case 'severe': return { bg: 'bg-[#FEF2F2]', text: 'text-[#DC2626]', dot: 'bg-[#B91C1C]' };
            default: return { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-500' };
        }
    };

    const testTypes = [
        { id: 'all', label: 'All Tests' },
        { id: 'depression', label: 'Depression' },
        { id: 'anxiety', label: 'Anxiety' },
        { id: 'adhd', label: 'ADHD' },
        { id: 'dla20', label: 'DLA-20' }
    ];

    return (
        <div className="min-h-screen pt-[64px] md:pt-[80px] bg-[#FAFAFA] font-sans flex flex-col pb-12 box-border">
            {/* Main Content Area */}
            <div className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 md:py-10">
                
                <div className="mb-8 max-w-2xl relative">
                    <button 
                        onClick={() => navigate('/patient-dashboard')} 
                        className="flex items-center gap-2 text-[13px] font-semibold text-gray-500 hover:text-teal-600 transition-colors mb-5 group"
                        aria-label="Back to Dashboard"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                        <FiArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        Back to Dashboard
                    </button>

                    <h1 className="text-[32px] md:text-[36px] font-extrabold text-gray-800 tracking-tight mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                        My Tests
                    </h1>
                    <p className="text-[15px] text-gray-500 font-medium leading-relaxed max-w-2xl" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Review your past mental health assessments to track your progress and wellbeing over time.
                    </p>
                </div>

                {/* Sleek Filter Pills */}
                <div className="flex flex-wrap gap-2 mb-10 border-b border-gray-100 pb-6">
                    {testTypes.map((type) => {
                        const isSelected = filterType === type.id;
                        return (
                            <button
                                key={type.id}
                                onClick={() => setFilterType(type.id)}
                                className={`px-4 py-2 rounded-full text-[13px] font-semibold transition-all duration-200 border ${
                                    isSelected
                                    ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                }`}
                                style={{ fontFamily: 'Inter, sans-serif' }}
                            >
                                {type.label}
                            </button>
                        );
                    })}
                </div>

                {/* Loading State */}
                {loading && (
                    <div className="text-center py-20">
                        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                        <p className="text-gray-500 text-[13px] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>Loading records...</p>
                    </div>
                )}

                {/* Empty State */}
                {!loading && assessments.length === 0 && (
                    <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm p-16 text-center max-w-3xl mx-auto">
                        <div className="w-16 h-16 bg-gray-50 border border-gray-100 rounded-full flex items-center justify-center mx-auto mb-5">
                            <FiList className="w-6 h-6 text-gray-400" />
                        </div>
                        <h3 className="text-[18px] font-bold text-gray-800 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                            No tests found
                        </h3>
                        <p className="text-gray-500 text-[14px] mb-8" style={{ fontFamily: 'Inter, sans-serif' }}>
                            You haven't completed any assessments in this category yet.
                        </p>
                        <button
                            onClick={() => navigate('/mental-health')}
                            className="px-6 py-2.5 rounded-[12px] text-[14px] font-semibold text-white bg-teal-600 hover:bg-teal-700 transition-colors shadow-sm"
                            style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                            Take an Assessment
                        </button>
                    </div>
                )}

                {/* Minimalist Grid Cards */}
                {!loading && assessments.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {assessments.map((assessment) => {
                            const test = MENTAL_HEALTH_TESTS[assessment.testType] || {
                                name: assessment.testType,
                                fullName: assessment.testType,
                                scoring: { maxScore: 100 }
                            };
                            const safeSeverity = assessment.scores?.severity || 'minimal';
                            const style = getSeverityStyle(safeSeverity);

                            return (
                                <div
                                    key={assessment._id}
                                    className="group bg-white rounded-[16px] border border-gray-100 hover:border-teal-200 shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden p-6 flex flex-col"
                                    onClick={() => navigate(`/test-results/${assessment._id}`)}
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex flex-col gap-1">
                                            <h3 className="text-[16px] font-bold text-gray-800 tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                {test.name}
                                            </h3>
                                            <p className="text-[12px] font-medium text-gray-400" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                {new Date(assessment.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • {new Date(assessment.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                        <span 
                                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase shrink-0"
                                            style={{ backgroundColor: style.bg, color: style.text, fontFamily: 'Inter, sans-serif' }}
                                        >
                                            <div className={`w-1.5 h-1.5 rounded-full ${style.dot}`}></div>
                                            {safeSeverity.replace('-', ' ')}
                                        </span>
                                    </div>
                                    
                                    <p className="text-[13px] text-gray-500 font-medium mb-6 line-clamp-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                                        {test.fullName}
                                    </p>

                                    <div className="mt-auto pt-5 border-t border-gray-50 flex items-center justify-between">
                                        <div className="flex-1 pr-6">
                                            <div className="flex items-baseline gap-1.5 mb-1.5">
                                                <span className="text-[24px] font-black leading-none text-gray-800 tracking-tighter" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                    {assessment.scores?.total || 0}
                                                </span>
                                                <span className="text-[13px] font-bold text-gray-400" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                    / {test.scoring.maxScore}
                                                </span>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-[3px] overflow-hidden">
                                                <div
                                                    className="h-full bg-teal-500 rounded-full transition-all duration-1000"
                                                    style={{ width: `${assessment.scores?.percentage || 0}%` }}
                                                />
                                            </div>
                                        </div>
                                        <div className="w-8 h-8 rounded-full border border-gray-100 bg-gray-50 flex items-center justify-center group-hover:bg-teal-50 group-hover:border-teal-200 group-hover:text-teal-600 text-gray-400 transition-all flex-shrink-0">
                                            <FiChevronRight className="w-4 h-4" />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MyTestsPage;
