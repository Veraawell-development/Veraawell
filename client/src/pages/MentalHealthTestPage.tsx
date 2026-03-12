import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MENTAL_HEALTH_TESTS, calculateTestScore } from '../data/mentalHealthTests';
import type { TestDefinition } from '../data/mentalHealthTests';
import { API_CONFIG } from '../config/api';

const MentalHealthTestPage: React.FC = () => {
    const { testType } = useParams<{ testType: string }>();
    const navigate = useNavigate();

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [responses, setResponses] = useState<Record<number, number>>({});
    const [test, setTest] = useState<TestDefinition | null>(null);

    useEffect(() => {
        if (!testType || !MENTAL_HEALTH_TESTS[testType]) {
            navigate('/mental-health');
            return;
        }
        setTest(MENTAL_HEALTH_TESTS[testType]);
    }, [testType, navigate]);

    if (!test) return null;

    // Filter questions based on conditions
    const visibleQuestions = test.questions.filter(q => {
        if (!q.sectionId) return true;
        const section = test.sections?.find(s => s.id === q.sectionId);
        if (!section || !section.condition) return true;
        return section.condition(responses);
    });

    const currentQuestion = visibleQuestions[currentQuestionIndex];
    if (!currentQuestion && visibleQuestions.length > 0) {
        // Fallback if current index is out of bounds due to condition changes
        setCurrentQuestionIndex(visibleQuestions.length - 1);
    }

    const handleAnswer = async (value: number) => {
        const newResponses = { ...responses, [currentQuestion.id]: value };
        setResponses(newResponses);

        if (currentQuestionIndex < visibleQuestions.length - 1) {
            setTimeout(() => setCurrentQuestionIndex(prev => prev + 1), 300);
        } else {
            await saveResults(newResponses);
        }
    };

    const saveResults = async (finalResponses: Record<number, number>) => {
        try {
            // Convert Record to Array for API
            const formattedResponses = Object.entries(finalResponses).map(([id, val]) => ({
                questionId: parseInt(id),
                answer: val
            }));

            const scores = calculateTestScore(test.id, formattedResponses);

            const response = await fetch(`${API_CONFIG.BASE_URL}/assessments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    testType: test.id,
                    responses: formattedResponses,
                    scores
                })
            });

            if (response.ok) {
                const data = await response.json();
                navigate(`/test-results/${data.assessment._id}`);
            } else {
                navigate(`/test-results/preview`, {
                    state: { testType: test.id, responses: formattedResponses, scores }
                });
            }
        } catch (error) {
            console.error('Error saving assessment:', error);
            const formattedResponses = Object.entries(finalResponses).map(([id, val]) => ({
                questionId: parseInt(id),
                answer: val
            }));
            const scores = calculateTestScore(test.id, formattedResponses);
            navigate(`/test-results/preview`, {
                state: { testType: test.id, responses: formattedResponses, scores }
            });
        }
    };

    const progress = visibleQuestions.length > 0 ? ((currentQuestionIndex + 1) / visibleQuestions.length) * 100 : 0;
    const currentSection = test.sections?.find(s => s.id === currentQuestion?.sectionId);
    const options = currentQuestion?.options || test.defaultOptions;

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
                        <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors" onClick={() => navigate('/mental-health')}>
                            <span className="text-base font-medium">All Tests</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Header */}
            <div className="py-2 px-4 shadow-sm" style={{ backgroundColor: '#ABA5D1' }}>
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"></path>
                        </svg>
                    </button>
                    <div className="text-center">
                        <h1 className="text-xl font-bold text-white leading-tight" style={{ fontFamily: 'Bree Serif, serif' }}>{test.name}</h1>
                        {currentSection && <p className="text-white/80 text-xs font-semibold uppercase tracking-wider">{currentSection.title}</p>}
                    </div>
                    <div className="w-10"></div>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="bg-white shadow-sm sticky top-0 z-30">
                <div className="max-w-4xl mx-auto px-4 py-2">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-500">
                            Question {currentQuestionIndex + 1} of {visibleQuestions.length}
                        </span>
                        <span className="text-xs font-medium text-teal-600">
                            {Math.round(progress)}%
                        </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-teal-400 to-teal-600 transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Test Content */}
            <div className="max-w-4xl mx-auto px-4 py-6">
                {currentSection?.description && (
                    <div className="mb-6 bg-teal-50 border border-teal-100 rounded-xl p-4 text-teal-800 text-sm italic">
                        {currentSection.description}
                    </div>
                )}

                <div className="bg-white rounded-3xl shadow-xl p-6 md:p-10 border border-white/20">
                    {/* Question */}
                    <div className="mb-10 text-center">
                        <p className="text-xl md:text-2xl font-bold text-gray-800 leading-snug" style={{ fontFamily: 'Bree Serif, serif' }}>
                            {currentQuestion?.text}
                        </p>
                    </div>

                    {/* Answer Options */}
                    <div className="grid grid-cols-1 gap-3">
                        {options.map((option) => (
                            <button
                                key={option.value}
                                onClick={() => handleAnswer(option.value)}
                                className={`group relative w-full py-4 px-6 rounded-2xl text-left transition-all duration-300 border-2 overflow-hidden ${responses[currentQuestion.id] === option.value
                                        ? 'border-teal-500 bg-teal-50 shadow-md transform scale-[1.01]'
                                        : 'border-gray-100 bg-gray-50 hover:border-teal-200 hover:bg-white hover:shadow-sm'
                                    }`}
                            >
                                <div className="flex items-center justify-between relative z-10">
                                    <span className={`text-base font-semibold ${responses[currentQuestion.id] === option.value ? 'text-teal-700' : 'text-gray-600 group-hover:text-gray-800'}`}>
                                        {option.label}
                                    </span>
                                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${responses[currentQuestion.id] === option.value ? 'border-teal-500 bg-teal-500' : 'border-gray-300'}`}>
                                        {responses[currentQuestion.id] === option.value && (
                                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                        )}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Navigation */}
                    <div className="mt-10 flex justify-between items-center pt-6 border-t border-gray-100">
                        <button 
                            disabled={currentQuestionIndex === 0}
                            onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                            className="text-gray-400 hover:text-teal-600 disabled:opacity-30 flex items-center space-x-1 text-sm font-bold transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7"/></svg>
                            <span>Back</span>
                        </button>
                        <span className="text-gray-300">|</span>
                        <div className="text-xs text-gray-400 font-medium">Automatic progress on select</div>
                    </div>
                </div>

                {/* Test Info */}
                <div className="mt-8 bg-white/50 backdrop-blur-sm rounded-2xl p-6 border border-white/50 shadow-sm">
                    <h4 className="text-gray-900 font-bold mb-1 text-sm">{test.fullName}</h4>
                    <p className="text-gray-600 text-xs leading-relaxed">{test.description}</p>
                </div>
            </div>
        </div>
    );
};

export default MentalHealthTestPage;
