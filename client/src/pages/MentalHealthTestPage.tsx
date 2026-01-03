import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MENTAL_HEALTH_TESTS, calculateTestScore } from '../data/mentalHealthTests';
import type { TestDefinition } from '../data/mentalHealthTests';
import { API_CONFIG } from '../config/api';

interface Answer {
  questionId: number;
  answer: number;
}

const MentalHealthTestPage: React.FC = () => {
  const { testType } = useParams<{ testType: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [test, setTest] = useState<TestDefinition | null>(null);

  useEffect(() => {
    // Validate test type and load test
    if (!testType || !MENTAL_HEALTH_TESTS[testType]) {
      navigate('/mental-health');
      return;
    }
    setTest(MENTAL_HEALTH_TESTS[testType]);
  }, [testType, navigate]);

  if (!test) {
    return null;
  }

  const handleAnswer = async (value: number) => {
    const newAnswers = [...answers];
    const existingIndex = newAnswers.findIndex(a => a.questionId === test.questions[currentQuestion].id);

    if (existingIndex >= 0) {
      newAnswers[existingIndex] = { questionId: test.questions[currentQuestion].id, answer: value };
    } else {
      newAnswers.push({ questionId: test.questions[currentQuestion].id, answer: value });
    }

    setAnswers(newAnswers);

    // Move to next question or finish
    if (currentQuestion < test.questions.length - 1) {
      setTimeout(() => setCurrentQuestion(currentQuestion + 1), 300);
    } else {
      // Test complete - save results
      await saveResults(newAnswers);
    }
  };

  const saveResults = async (finalAnswers: Answer[]) => {
    try {
      const scores = calculateTestScore(test.id, finalAnswers);

      const response = await fetch(`${API_CONFIG.BASE_URL}/assessments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          testType: test.id,
          responses: finalAnswers,
          scores
        })
      });

      if (response.ok) {
        const data = await response.json();
        // Navigate to results page
        navigate(`/test-results/${data.assessment._id}`);
      } else {
        console.error('Failed to save assessment');
        // Still show results even if save fails
        navigate(`/test-results/preview`, {
          state: { testType: test.id, responses: finalAnswers, scores }
        });
      }
    } catch (error) {
      console.error('Error saving assessment:', error);
      // Show results even if save fails
      const scores = calculateTestScore(test.id, finalAnswers);
      navigate(`/test-results/preview`, {
        state: { testType: test.id, responses: finalAnswers, scores }
      });
    }
  };

  const currentAnswer = answers.find(a => a.questionId === test.questions[currentQuestion]?.id);
  const progress = ((currentQuestion + 1) / test.questions.length) * 100;

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
      <div className="py-4 px-4 shadow-sm" style={{ backgroundColor: '#ABA5D1' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"></path>
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Bree Serif, serif' }}>{test.name}</h1>
          <div className="w-10"></div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
              Question {currentQuestion + 1} of {test.questions.length}
            </span>
            <span className="text-sm font-medium text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
              {Math.round(progress)}% Complete
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-teal-500 to-cyan-600 transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Test Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          {/* Question */}
          <div className="mb-8">
            <p className="text-2xl md:text-3xl font-bold text-gray-900 leading-relaxed" style={{ fontFamily: 'Bree Serif, serif' }}>
              {test.questions[currentQuestion].text}
            </p>
          </div>

          {/* Answer Options */}
          <div className="space-y-3">
            {test.answerOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => handleAnswer(option.value)}
                className={`w-full py-4 px-6 rounded-xl text-left text-lg font-medium transition-all duration-200 border-2 ${currentAnswer?.answer === option.value
                  ? 'bg-gradient-to-r from-teal-500 to-cyan-600 text-white border-teal-500 shadow-lg'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-teal-400 hover:bg-teal-50'
                  }`}
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                <div className="flex items-center justify-between">
                  <span>{option.label}</span>
                  {currentAnswer?.answer === option.value && (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Navigation Hint */}
          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
              Select an answer to continue
            </p>
          </div>
        </div>

        {/* Test Info */}
        <div className="mt-6 bg-white rounded-xl p-4 border-l-4 border-teal-500">
          <p className="text-sm text-gray-700" style={{ fontFamily: 'Inter, sans-serif' }}>
            <strong className="text-gray-900">{test.fullName}:</strong> {test.description}
          </p>
        </div>
      </div>
    </div>
  );
};

export default MentalHealthTestPage;
