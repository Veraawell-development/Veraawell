import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { MENTAL_HEALTH_TESTS } from '../data/mentalHealthTests';
import { API_CONFIG } from '../config/api';

const MentalHealthDashboard: React.FC = () => {
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [latestScores, setLatestScores] = useState<Record<string, any>>({});

    useEffect(() => {
        fetchLatestScores();

        // Refresh scores when user returns to the page
        const handleFocus = () => {
            fetchLatestScores();
        };

        const handleVisibilityChange = () => {
            if (!document.hidden) {
                fetchLatestScores();
            }
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    const fetchLatestScores = async () => {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}/assessments/stats/summary`, {
                credentials: 'include'
            });

            if (response.ok) {
                const stats = await response.json();
                const scoresMap: Record<string, any> = {};
                stats.forEach((stat: any) => {
                    scoresMap[stat._id] = stat;
                });
                setLatestScores(scoresMap);
            }
        } catch (error) {
            console.error('Error fetching scores:', error);
        }
    };

    const getSeverityInfo = (score: number, testId: string) => {
        const test = MENTAL_HEALTH_TESTS[testId as keyof typeof MENTAL_HEALTH_TESTS];
        if (!test) return { label: 'Unknown', color: '#6B7280' };

        const levels = test.scoring.severityLevels;

        // Check severity levels in order from most to least severe
        if (score >= levels.severe.min) {
            return { label: 'Severe', color: getSeverityColor('Severe') };
        }
        if (levels['moderately-severe'] && score >= levels['moderately-severe'].min) {
            return { label: 'Moderately Severe', color: getSeverityColor('Moderately Severe') };
        }
        if (score >= levels.moderate.min) {
            return { label: 'Moderate', color: getSeverityColor('Moderate') };
        }
        if (score >= levels.mild.min) {
            return { label: 'Mild', color: getSeverityColor('Mild') };
        }
        if (score <= levels.minimal.max) {
            return { label: 'Minimal', color: getSeverityColor('Minimal') };
        }

        return { label: 'Unknown', color: '#6B7280' };
    };

    const getSeverityColor = (label: string) => {
        const lowerLabel = label.toLowerCase();
        if (lowerLabel.includes('minimal') || lowerLabel.includes('none') || lowerLabel.includes('normal')) return '#10B981';
        if (lowerLabel.includes('mild')) return '#F59E0B';
        if (lowerLabel.includes('moderate')) return '#F97316';
        if (lowerLabel.includes('severe') || lowerLabel.includes('moderately severe')) return '#EF4444';
        return '#6B7280';
    };

    const testCards = [
        {
            ...MENTAL_HEALTH_TESTS.depression,
            icon: (
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            ),
            color: 'from-blue-500 to-blue-600'
        },
        {
            ...MENTAL_HEALTH_TESTS.anxiety,
            icon: (
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
            color: 'from-purple-500 to-purple-600'
        },
        {
            ...MENTAL_HEALTH_TESTS.adhd,
            icon: (
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
            ),
            color: 'from-teal-500 to-cyan-600'
        },
        {
            ...MENTAL_HEALTH_TESTS.dla20,
            icon: (
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
            ),
            color: 'from-green-500 to-emerald-600'
        }
    ];

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
                    <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Bree Serif, serif' }}>Mental Health Screening</h1>
                    <div className="w-10"></div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-6xl mx-auto px-4 py-8">
                <div className="mb-8 text-center">
                    <p className="text-lg text-gray-700" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Select a screening tool to assess your mental health. These are confidential self-assessments.
                    </p>
                </div>

                {/* Test Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {testCards.map((test) => {
                        const latestScore = latestScores[test.id];
                        const severityInfo = latestScore ? getSeverityInfo(latestScore.latestScore, test.id) : null;

                        return (
                            <div
                                key={test.id}
                                className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group cursor-pointer"
                                onClick={() => navigate(`/mental-health/${test.id}`)}
                            >
                                <div className={`bg-gradient-to-r ${test.color} p-6 text-white relative`}>
                                    {latestScore && (
                                        <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                            Completed
                                        </div>
                                    )}
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <h3 className="text-2xl font-bold mb-1" style={{ fontFamily: 'Bree Serif, serif' }}>{test.name}</h3>
                                            <p className="text-white/90 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>{test.fullName}</p>
                                        </div>
                                        <div className="opacity-80 group-hover:opacity-100 transition-opacity">
                                            {test.icon}
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6">
                                    {latestScore ? (
                                        // COMPLETED TEST VIEW
                                        <>
                                            <div className="text-center mb-4">
                                                <p className="text-sm text-gray-500 mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                    Latest Score
                                                </p>
                                                <div className="text-5xl font-bold mb-3" style={{
                                                    fontFamily: 'Bree Serif, serif',
                                                    color: severityInfo?.color || '#6B7280'
                                                }}>
                                                    {latestScore.latestScore}
                                                    <span className="text-2xl text-gray-400">/{test.scoring.maxScore}</span>
                                                </div>
                                                <div className="inline-block px-4 py-1.5 rounded-full text-sm font-semibold mb-3"
                                                    style={{
                                                        backgroundColor: `${severityInfo?.color}20`,
                                                        color: severityInfo?.color || '#6B7280'
                                                    }}
                                                >
                                                    {severityInfo?.label || 'Unknown'}
                                                </div>
                                                <p className="text-xs text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                    Last taken: {new Date(latestScore.latestDate).toLocaleDateString()}
                                                </p>
                                            </div>

                                            <button className="w-full py-3 rounded-xl font-bold text-white transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
                                                style={{
                                                    fontFamily: 'Bree Serif, serif',
                                                    background: `linear-gradient(135deg, ${test.color.split(' ')[1].replace('to-', '')} 0%, ${test.color.split(' ')[2]} 100%)`
                                                }}
                                            >
                                                Retest
                                            </button>
                                        </>
                                    ) : (
                                        // NOT TAKEN TEST VIEW
                                        <>
                                            <p className="text-gray-600 mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                {test.description}
                                            </p>

                                            <div className="flex items-center justify-between text-sm text-gray-500 mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                <div className="flex items-center gap-2">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    <span>{test.questionCount} questions</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    <span>{test.estimatedTime}</span>
                                                </div>
                                            </div>

                                            <button className="w-full py-3 rounded-xl font-bold text-white transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
                                                style={{
                                                    fontFamily: 'Bree Serif, serif',
                                                    background: `linear-gradient(135deg, ${test.color.split(' ')[1].replace('to-', '')} 0%, ${test.color.split(' ')[2]} 100%)`
                                                }}
                                            >
                                                Take Test
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Disclaimer */}
                <div className="mt-8 bg-white rounded-xl p-6 border-l-4 border-teal-500">
                    <h3 className="text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Bree Serif, serif' }}>Important Information</h3>
                    <p className="text-gray-700 text-sm leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
                        These screening tools are for informational purposes only and do not constitute a clinical diagnosis.
                        If you're experiencing significant distress or mental health concerns, please consult with a qualified
                        mental health professional for a comprehensive evaluation.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default MentalHealthDashboard;
