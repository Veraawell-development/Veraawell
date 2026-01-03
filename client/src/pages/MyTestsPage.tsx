import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MENTAL_HEALTH_TESTS } from '../data/mentalHealthTests';
import { API_CONFIG } from '../config/api';

const MyTestsPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    const [sidebarOpen, setSidebarOpen] = useState(false);
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

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'minimal': return { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' };
            case 'mild': return { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' };
            case 'moderate': return { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' };
            case 'moderately-severe': return { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' };
            case 'severe': return { bg: 'bg-red-50', text: 'text-red-800', dot: 'bg-red-600' };
            default: return { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-500' };
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
        <div className="min-h-screen" style={{ backgroundColor: '#E0EAEA' }}>
            {/* Sidebar */}
            {sidebarOpen && <div className="fixed inset-0 z-40" onClick={() => setSidebarOpen(false)} />}
            <div className={`fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 shadow-lg transform transition-transform duration-300 ease-in-out z-50 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ backgroundColor: '#7DA9A8' }}>
                <div className="h-full flex flex-col p-4 text-white font-serif">
                    <div className="space-y-3">
                        <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors" onClick={() => navigate('/patient-dashboard')}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                            </svg>
                            <span className="text-base font-medium">My Dashboard</span>
                        </div>
                        <div className="flex items-center space-x-3 cursor-pointer bg-white/20 p-2 rounded-lg transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            <span className="text-base font-medium">My Tests</span>
                        </div>
                        <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors" onClick={() => navigate('/my-journal')}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                            <span className="text-base font-medium">My Journal</span>
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
                    <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Bree Serif, serif' }}>My Tests</h1>
                    <div className="w-10"></div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-4xl mx-auto px-4 py-8">
                {/* Filter Pills */}
                <div className="flex flex-wrap gap-2 mb-8">
                    {testTypes.map((type) => (
                        <button
                            key={type.id}
                            onClick={() => setFilterType(type.id)}
                            className={`px-5 py-2 rounded-full font-medium text-sm transition-all ${filterType === type.id
                                    ? 'bg-white text-teal-600 shadow-md'
                                    : 'bg-white/60 text-gray-600 hover:bg-white hover:shadow-sm'
                                }`}
                            style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                            {type.label}
                        </button>
                    ))}
                </div>

                {/* Loading State */}
                {loading && (
                    <div className="text-center py-16">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
                        <p className="text-gray-500 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>Loading...</p>
                    </div>
                )}

                {/* Empty State */}
                {!loading && assessments.length === 0 && (
                    <div className="bg-white rounded-2xl shadow-sm p-16 text-center">
                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Bree Serif, serif' }}>
                            No tests yet
                        </h3>
                        <p className="text-gray-500 mb-6 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Take your first mental health assessment
                        </p>
                        <button
                            onClick={() => navigate('/patient-dashboard')}
                            className="px-6 py-2.5 rounded-xl font-semibold text-white transition-all shadow-md hover:shadow-lg"
                            style={{
                                fontFamily: 'Inter, sans-serif',
                                background: 'linear-gradient(135deg, #6DBEDF 0%, #5DBEBD 100%)'
                            }}
                        >
                            Take a Test
                        </button>
                    </div>
                )}

                {/* Test History - Minimal Cards */}
                {!loading && assessments.length > 0 && (
                    <div className="space-y-3">
                        {assessments.map((assessment) => {
                            const test = MENTAL_HEALTH_TESTS[assessment.testType];
                            const severityColors = getSeverityColor(assessment.scores.severity);

                            return (
                                <div
                                    key={assessment._id}
                                    className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden border border-gray-100"
                                    onClick={() => navigate(`/test-results/${assessment._id}`)}
                                >
                                    <div className="p-5">
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>
                                                        {test.name}
                                                    </h3>
                                                    <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${severityColors.bg}`}>
                                                        <div className={`w-1.5 h-1.5 rounded-full ${severityColors.dot}`}></div>
                                                        <span className={`text-xs font-semibold ${severityColors.text}`} style={{ fontFamily: 'Inter, sans-serif' }}>
                                                            {assessment.scores.severity.charAt(0).toUpperCase() + assessment.scores.severity.slice(1).replace('-', ' ')}
                                                        </span>
                                                    </div>
                                                </div>
                                                <p className="text-sm text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                    {test.fullName}
                                                </p>
                                            </div>
                                            <div className="text-right ml-4">
                                                <p className="text-sm font-medium text-gray-700" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                    {new Date(assessment.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                </p>
                                                <p className="text-xs text-gray-400" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                    {new Date(assessment.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className="text-xs font-medium text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                        Score
                                                    </span>
                                                    <span className="text-sm font-bold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                        {assessment.scores.total} / {test.scoring.maxScore}
                                                    </span>
                                                </div>
                                                <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-teal-500 to-cyan-600 rounded-full transition-all"
                                                        style={{ width: `${assessment.scores.percentage}%` }}
                                                    />
                                                </div>
                                            </div>
                                            <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
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
