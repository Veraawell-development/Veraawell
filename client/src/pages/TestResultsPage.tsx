import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MENTAL_HEALTH_TESTS } from '../data/mentalHealthTests';
import { API_CONFIG } from '../config/api';

const TestResultsPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();

    const [assessment, setAssessment] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);

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
                setAssessment(data);
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
            <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#E0EAEA' }}>
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-teal-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>Loading results...</p>
                </div>
            </div>
        );
    }

    if (!assessment) {
        return null;
    }

    const test = MENTAL_HEALTH_TESTS[assessment.testType];
    const { total, severity, percentage } = assessment.scores;

    const getSeverityColor = (sev: string) => {
        switch (sev) {
            case 'minimal': return { bg: 'bg-green-50', border: 'border-green-500', text: 'text-green-700', bar: 'from-green-400 to-green-600' };
            case 'mild': return { bg: 'bg-yellow-50', border: 'border-yellow-500', text: 'text-yellow-700', bar: 'from-yellow-400 to-yellow-600' };
            case 'moderate': return { bg: 'bg-orange-50', border: 'border-orange-500', text: 'text-orange-700', bar: 'from-orange-400 to-orange-600' };
            case 'moderately-severe': return { bg: 'bg-red-50', border: 'border-red-500', text: 'text-red-700', bar: 'from-red-400 to-red-600' };
            case 'severe': return { bg: 'bg-red-50', border: 'border-red-600', text: 'text-red-800', bar: 'from-red-500 to-red-700' };
            default: return { bg: 'bg-gray-50', border: 'border-gray-500', text: 'text-gray-700', bar: 'from-gray-400 to-gray-600' };
        }
    };

    const colors = getSeverityColor(severity);

    return (
        <div className="min-h-screen" style={{ backgroundColor: '#E0EAEA' }}>
            {/* Sidebar */}
            {sidebarOpen && <div className="fixed inset-0 z-40" onClick={() => setSidebarOpen(false)} />}
            <div className={`fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 shadow-lg transform transition-transform duration-300 ease-in-out z-50 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ backgroundColor: '#7DA9A8' }}>
                <div className="h-full flex flex-col p-4 text-white font-serif">
                    <div className="space-y-3">
                        <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors" onClick={() => navigate('/patient-dashboard')}>
                            <span className="text-base font-medium">My Dashboard</span>
                        </div>
                        <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors" onClick={() => navigate('/my-tests')}>
                            <span className="text-base font-medium">My Tests</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Header */}
            <div className="py-4 px-4 shadow-sm" style={{ backgroundColor: '#ABA5D1' }}>
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"></path>
                        </svg>
                    </button>
                    <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Bree Serif, serif' }}>Test Results</h1>
                    <div className="w-10"></div>
                </div>
            </div>

            {/* Results Content */}
            <div className="max-w-4xl mx-auto px-4 py-8">
                <div className="bg-white rounded-2xl shadow-xl p-8">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <h2 className="text-3xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Bree Serif, serif' }}>
                            {test.name} Results
                        </h2>
                        <p className="text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {test.fullName}
                        </p>
                        <p className="text-sm text-gray-500 mt-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Completed: {new Date(assessment.completedAt).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                        </p>
                    </div>

                    {/* Score Display */}
                    <div className="mb-8">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>Your Score</h3>
                            <div className={`px-4 py-2 rounded-full ${colors.bg} ${colors.border} border-2`}>
                                <span className={`font-bold text-lg ${colors.text}`} style={{ fontFamily: 'Inter, sans-serif' }}>
                                    {severity.charAt(0).toUpperCase() + severity.slice(1).replace('-', ' ')}
                                </span>
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    Score: {total} / {test.scoring.maxScore}
                                </span>
                                <span className="text-sm font-medium text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    {percentage}%
                                </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                                <div
                                    className={`h-full bg-gradient-to-r ${colors.bar} transition-all duration-500`}
                                    style={{ width: `${percentage}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Interpretation */}
                    {assessment.interpretation && (
                        <div className={`p-6 rounded-xl ${colors.bg} ${colors.border} border-l-4 mb-8`}>
                            <h3 className="text-lg font-bold mb-2" style={{ fontFamily: 'Bree Serif, serif', color: colors.text.replace('text-', '') }}>
                                What This Means
                            </h3>
                            <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
                                {assessment.interpretation.description}
                            </p>
                        </div>
                    )}

                    {/* Disclaimer */}
                    <div className="p-6 bg-blue-50 rounded-xl border-l-4 border-blue-500 mb-8">
                        <h3 className="text-lg font-bold text-blue-900 mb-2" style={{ fontFamily: 'Bree Serif, serif' }}>
                            Important Information
                        </h3>
                        <p className="text-blue-800 text-sm leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
                            This screening is not a diagnosis. If you're experiencing significant distress or mental health concerns,
                            please consult with a qualified mental health professional for a comprehensive evaluation.
                        </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row gap-4">
                        <button
                            onClick={() => navigate('/patient-dashboard')}
                            className="flex-1 py-3 rounded-xl font-bold text-white transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                            style={{
                                fontFamily: 'Bree Serif, serif',
                                background: 'linear-gradient(135deg, #6DBEDF 0%, #5DBEBD 100%)'
                            }}
                        >
                            Back to Dashboard
                        </button>
                        <button
                            onClick={() => navigate(`/mental-health/${assessment.testType}`)}
                            className="flex-1 py-3 rounded-xl font-bold bg-white border-2 border-teal-500 text-teal-600 hover:bg-teal-50 transition-all"
                            style={{ fontFamily: 'Bree Serif, serif' }}
                        >
                            Retake Test
                        </button>
                        <button
                            onClick={() => navigate('/my-tests')}
                            className="flex-1 py-3 rounded-xl font-bold bg-white border-2 border-gray-300 text-gray-700 hover:bg-gray-50 transition-all"
                            style={{ fontFamily: 'Bree Serif, serif' }}
                        >
                            View History
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TestResultsPage;
