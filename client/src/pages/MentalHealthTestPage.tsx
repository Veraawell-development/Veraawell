import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MENTAL_HEALTH_TESTS, calculateTestScore } from '../data/mentalHealthTests';
import type { TestDefinition } from '../data/mentalHealthTests';
import { API_CONFIG } from '../config/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';

const MentalHealthTestPage: React.FC = () => {
    const { testType } = useParams<{ testType: string }>();
    const navigate = useNavigate();

    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [responses, setResponses] = useState<Record<number, number>>({});
    const [test, setTest] = useState<TestDefinition | null>(null);
    const queryClient = useQueryClient();

    const saveAssessmentMutation = useMutation({
        mutationFn: async (payload: any) => {
            const response = await fetch(`${API_CONFIG.BASE_URL}/assessments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error('Failed to save assessment');
            return response.json();
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['patient', 'assessments'] });
            navigate(`/test-results/${data.assessment._id}`);
        },
        onError: (error, variables) => {
            console.error('Error saving assessment:', error);
            navigate(`/test-results/preview`, {
                state: { testType: variables.testType, responses: variables.responses, scores: variables.scores }
            });
        }
    });

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

    const saveResults = (finalResponses: Record<number, number>) => {
        const formattedResponses = Object.entries(finalResponses).map(([id, val]) => ({
            questionId: parseInt(id),
            answer: val
        }));
        const scores = calculateTestScore(test.id, formattedResponses);
        
        saveAssessmentMutation.mutate({
            testType: test.id,
            responses: formattedResponses,
            scores
        });
    };

    const progress = visibleQuestions.length > 0 ? ((currentQuestionIndex + 1) / visibleQuestions.length) * 100 : 0;
    const currentSection = test.sections?.find(s => s.id === currentQuestion?.sectionId);
    const options = currentQuestion?.options || test.defaultOptions;

    return (
        <div className="h-screen pt-[64px] md:pt-[80px] overflow-hidden bg-[#FAFAFA] font-sans flex flex-col box-border">
            {/* Ultra-Minimal Header */}
            <div className="bg-white border-b border-gray-200 z-30 shrink-0">
                <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => navigate('/mental-health')} 
                            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
                            aria-label="Back to Dashboard"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                            </svg>
                        </button>
                        <div className="h-5 w-px bg-gray-200"></div>
                        <h1 className="text-[15px] font-semibold text-gray-900 tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {test.name}
                        </h1>
                    </div>
                    
                    <div className="text-[13px] font-medium text-gray-400" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {currentQuestionIndex + 1} / {visibleQuestions.length}
                    </div>
                </div>
                {/* Thin, elegant progress bar */}
                <div className="w-full bg-gray-100 h-[2px]">
                    <div
                        className="h-full bg-teal-500 transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            {/* Main Test Area - Inner Scrollable if necessary */}
            <div className="flex-1 overflow-y-auto w-full">
                <div className="max-w-3xl mx-auto w-full px-6 py-8 md:py-12 flex flex-col min-h-full">
                    
                    {/* Section Description if applicable */}
                {currentSection?.description && (
                    <div className="mb-8 p-4 bg-gray-50 border border-gray-200 rounded-xl text-[14px] text-gray-600 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {currentSection.description}
                    </div>
                )}

                {/* Question */}
                <div className="mb-10">
                    <h2 className="text-[24px] md:text-[28px] font-bold text-gray-800 leading-tight tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {currentQuestion?.text}
                    </h2>
                </div>

                {/* Options Grid */}
                <div className="space-y-3 mb-12">
                    {options.map((option) => {
                        const isSelected = responses[currentQuestion.id] === option.value;
                        return (
                            <button
                                key={option.value}
                                onClick={() => handleAnswer(option.value)}
                                className={`w-full group flex items-center justify-between p-5 rounded-[12px] border text-left transition-all duration-200 ${
                                    isSelected 
                                    ? 'border-teal-500 bg-white ring-1 ring-teal-500 shadow-sm' 
                                    : 'border-gray-200 bg-white hover:border-gray-400 hover:bg-gray-50'
                                }`}
                            >
                                <span className={`text-[15px] font-semibold ${isSelected ? 'text-gray-900' : 'text-gray-700'}`} style={{ fontFamily: 'Inter, sans-serif' }}>
                                    {option.label}
                                </span>
                                
                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                                    isSelected 
                                    ? 'border-teal-500 bg-teal-500' 
                                    : 'border-gray-300 bg-white'
                                }`}>
                                    {isSelected && (
                                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Footer Actions */}
                <div className="mt-auto pt-8 flex items-center justify-between border-t border-gray-200/60">
                    <button 
                        disabled={currentQuestionIndex === 0}
                        onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                        className="flex items-center gap-2 text-[14px] font-semibold text-gray-500 hover:text-gray-900 disabled:opacity-30 transition-colors"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                        </svg>
                        Back
                    </button>
                    
                    <span className="text-[13px] font-medium text-gray-400" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Auto-advances on selection
                    </span>
                </div>
                
                {/* Assessment Info Context */}
                <div className="mt-12 text-center">
                    <p className="text-[12px] font-medium text-gray-400" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {test.fullName}
                    </p>
                </div>
            </div>
            </div>
        </div>
    );
};

export default MentalHealthTestPage;
