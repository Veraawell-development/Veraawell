import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { MENTAL_HEALTH_TESTS } from '../data/mentalHealthTests';
import { API_CONFIG } from '../config/api';
import { FiArrowLeft, FiRefreshCw, FiList, FiAlertCircle } from 'react-icons/fi';

const TestResultsPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    const [assessment, setAssessment] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check if we have preview data from location state
        if (id === 'preview' && location.state) {
            const { testType, scores } = location.state;
            setAssessment({
                testType,
                scores,
                completedAt: new Date(),
                isPreview: true
            });
            setLoading(false);
        } else if (id) {
            fetchAssessment();
        }
    }, [id, location.state]);

    const fetchAssessment = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${API_CONFIG.BASE_URL}/assessments/${id}`, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setAssessment(data.assessment);
            } else {
                console.error('Failed to fetch assessment');
                navigate('/patient-dashboard');
            }
        } catch (error) {
            console.error('Error fetching assessment:', error);
            navigate('/patient-dashboard');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen pt-[64px] md:pt-[80px] flex items-center justify-center bg-[#FAFAFA] box-border">
                <div className="text-center">
                    <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin mx-auto"></div>
                </div>
            </div>
        );
    }

    if (!assessment) {
        return null;
    }

    const test = MENTAL_HEALTH_TESTS[assessment.testType] || {
        name: assessment.testType,
        fullName: assessment.testType,
        scoring: { maxScore: 100 }
    };
    const { total, severity, percentage } = assessment.scores || { total: 0, severity: 'minimal', percentage: 0 };
    const safeSeverity = severity || 'minimal';

    const getSeverityStyle = (sev: string) => {
        switch (sev) {
            case 'minimal': return { bg: 'bg-[#ECFDF5]', text: 'text-[#059669]', bar: 'bg-[#059669]' };
            case 'mild': return { bg: 'bg-[#FEF3C7]', text: 'text-[#D97706]', bar: 'bg-[#D97706]' };
            case 'moderate': return { bg: 'bg-[#FFF7ED]', text: 'text-[#EA580C]', bar: 'bg-[#EA580C]' };
            case 'moderately-severe': return { bg: 'bg-[#FEF2F2]', text: 'text-[#DC2626]', bar: 'bg-[#DC2626]' };
            case 'severe': return { bg: 'bg-[#FEF2F2]', text: 'text-[#DC2626]', bar: 'bg-[#B91C1C]' };
            default: return { bg: 'bg-gray-100', text: 'text-gray-600', bar: 'bg-gray-600' };
        }
    };

    const style = getSeverityStyle(safeSeverity);
    const interpretationText = typeof assessment.interpretation === 'string' 
        ? assessment.interpretation 
        : assessment.interpretation?.description || 'Based on your responses, your symptoms fall into this category. Please review with your healthcare provider.';

    return (
        <div className="min-h-screen pt-[64px] md:pt-[80px] bg-[#FAFAFA] font-sans flex flex-col pb-12 box-border">
            {/* Results Content */}
            <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-8 md:py-10">
                
                {/* Header Information */}
                <div className="mb-12 relative">
                    <button 
                        onClick={() => navigate('/mental-health')} 
                        className="flex items-center gap-2 text-[13px] font-semibold text-gray-500 hover:text-gray-900 transition-colors mb-5 group"
                        aria-label="Back to Assessments"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                        <FiArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        Back to Assessments
                    </button>

                    <h1 className="text-[32px] md:text-[36px] font-extrabold text-gray-800 tracking-tight leading-tight mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {test.name}
                    </h1>
                    <p className="text-[15px] text-gray-500 font-medium mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {test.fullName}
                    </p>
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-md border border-gray-200/50">
                        <span className="text-[12px] font-medium text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Completed on {assessment.completedAt ? new Date(assessment.completedAt).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                            }) : 'N/A'}
                        </span>
                    </div>
                </div>

                {/* Score Card */}
                <div className="bg-white rounded-[24px] border border-gray-200 shadow-sm p-8 md:p-10 mb-8">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
                        <div>
                            <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-wider mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>Total Score</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-[64px] leading-none font-black tracking-tighter text-gray-800" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    {total}
                                </span>
                                <span className="text-[20px] font-bold text-gray-300" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    / {test.scoring.maxScore}
                                </span>
                            </div>
                        </div>
                        <div className="flex-shrink-0">
                            <span 
                                className="inline-flex px-4 py-1.5 rounded-full text-[14px] font-bold tracking-wide"
                                style={{ backgroundColor: style.bg, color: style.text, fontFamily: 'Inter, sans-serif' }}
                            >
                                {safeSeverity.charAt(0).toUpperCase() + safeSeverity.slice(1).replace('-', ' ')}
                            </span>
                        </div>
                    </div>

                    {/* Minimal Progress Line */}
                    <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden mb-12">
                        <div
                            className={`h-full ${style.bar} transition-all duration-1000 ease-out`}
                            style={{ width: `${percentage}%` }}
                        />
                    </div>

                    {/* Interpretation */}
                    <div className="prose prose-sm max-w-none">
                        <h3 className="text-[16px] font-bold text-gray-800 mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>What this means</h3>
                        <p className="text-[15px] text-gray-600 leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {interpretationText}
                        </p>
                    </div>
                </div>

                {/* Disclaimer Context */}
                <div className="flex items-start gap-3 p-5 bg-gray-50 rounded-[16px] border border-gray-200 mb-10">
                    <FiAlertCircle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[13px] text-gray-500 leading-relaxed font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                        This screening tool is not a diagnostic instrument. You are encouraged to share your results with a physician or healthcare provider. Veera Health is not a substitute for professional medical advice, diagnosis, or treatment.
                    </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-200/60">
                    <button
                        onClick={() => navigate(`/mental-health/${assessment.testType}`)}
                        className="flex-1 py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white text-[14px] font-semibold rounded-[12px] transition-colors flex items-center justify-center gap-2"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                        <FiRefreshCw className="w-4 h-4" />
                        Retake Assessment
                    </button>
                    <button
                        onClick={() => navigate('/my-tests')}
                        className="flex-1 py-3 px-4 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700 text-[14px] font-semibold rounded-[12px] transition-colors flex items-center justify-center gap-2"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                        <FiList className="w-4 h-4" />
                        View History
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TestResultsPage;
