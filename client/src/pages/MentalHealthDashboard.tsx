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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 118.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
            ),
            color: 'from-blue-500 to-indigo-600'
        },
        {
            ...MENTAL_HEALTH_TESTS.anxiety,
            icon: (
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            ),
            color: 'from-purple-500 to-pink-600'
        },
        {
            ...MENTAL_HEALTH_TESTS.adhd,
            icon: (
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
            ),
            color: 'from-teal-500 to-emerald-600'
        },
        {
            ...MENTAL_HEALTH_TESTS.ptsd,
            icon: (
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
            ),
            color: 'from-rose-500 to-red-600'
        },
        {
            ...MENTAL_HEALTH_TESTS.addiction,
            icon: (
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.631.316a6 6 0 01-3.86.517l-2.387-.477a2 2 0 00-1.022.547l-1.16 1.16a2 2 0 000 2.828l1.16 1.16a2 2 0 002.828 0l1.16-1.16a2 2 0 00.547-1.022l.477-2.387a6 6 0 00-.517-3.86l-.316-.631a6 6 0 01-.517-3.86l.477-2.387a2 2 0 00-.547-1.022l-1.16-1.16a2 2 0 00-2.828 0l-1.16 1.16a2 2 0 000 2.828l1.16 1.16a2 2 0 001.022.547l2.387.477a6 6 0 003.86-.517l.631-.316a6 6 0 013.86-.517l2.387.477a2 2 0 001.022-.547l1.16-1.16a2 2 0 000-2.828l-1.16-1.16a2 2 0 00-2.828 0l-1.16 1.16z" />
                </svg>
            ),
            color: 'from-amber-600 to-orange-700'
        },
        {
            ...MENTAL_HEALTH_TESTS['social-anxiety'],
            icon: (
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
            ),
            color: 'from-cyan-500 to-blue-600'
        },
        {
            ...MENTAL_HEALTH_TESTS['post-partum'],
            icon: (
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
            ),
            color: 'from-pink-400 to-rose-500'
        },
        {
            ...MENTAL_HEALTH_TESTS.bipolar,
            icon: (
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
            ),
            color: 'from-orange-400 to-red-500'
        },
        {
            ...MENTAL_HEALTH_TESTS.gambling,
            icon: (
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M12 16v1m-6-6h.01M6 16h.01M18 16h.01M18 10h.01" />
                </svg>
            ),
            color: 'from-green-600 to-emerald-700'
        },
        {
            ...MENTAL_HEALTH_TESTS['eating-disorder'],
            icon: (
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 01-6.001 0M18 7l-3 9m3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                </svg>
            ),
            color: 'from-blue-400 to-sky-500'
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
