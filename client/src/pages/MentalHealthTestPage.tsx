import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface Question {
  id: number;
  text: string;
  category: string;
}

interface Answer {
  questionId: number;
  value: number;
}

const MentalHealthTestPage: React.FC = () => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [showResults, setShowResults] = useState(false);

  const questions: Question[] = [
    { id: 1, text: "I feel sad and low", category: "Depression" },
    { id: 2, text: "I have trouble concentrating on tasks", category: "ADHD" },
    { id: 3, text: "I feel nervous or anxious", category: "Anxiety" },
    { id: 4, text: "I have difficulty falling or staying asleep", category: "Sleep" },
    { id: 5, text: "I feel tired or have little energy", category: "Depression" },
    { id: 6, text: "I have trouble sitting still", category: "ADHD" },
    { id: 7, text: "I worry about things going wrong", category: "Anxiety" },
    { id: 8, text: "I have lost interest in activities I used to enjoy", category: "Depression" },
    { id: 9, text: "I make careless mistakes", category: "ADHD" },
    { id: 10, text: "I feel my heart racing or pounding", category: "Anxiety" },
    { id: 11, text: "I have thoughts of harming myself", category: "Depression" },
    { id: 12, text: "I interrupt others when they're speaking", category: "ADHD" },
    { id: 13, text: "I avoid social situations", category: "Anxiety" },
    { id: 14, text: "I feel worthless or guilty", category: "Depression" },
    { id: 15, text: "I lose things necessary for tasks", category: "ADHD" },
    { id: 16, text: "I experience panic attacks", category: "Anxiety" },
    { id: 17, text: "I have changes in my appetite", category: "Depression" },
    { id: 18, text: "I have difficulty waiting my turn", category: "ADHD" },
    { id: 19, text: "I feel restless or on edge", category: "Anxiety" },
    { id: 20, text: "I feel hopeless about the future", category: "Depression" }
  ];

  const answerOptions = [
    { label: 'Never', value: 0 },
    { label: 'Hardly ever', value: 1 },
    { label: 'Sometimes', value: 2 },
    { label: 'Many times', value: 3 },
    { label: 'All the time', value: 4 }
  ];

  const handleAnswer = (value: number) => {
    const newAnswers = [...answers];
    const existingIndex = newAnswers.findIndex(a => a.questionId === questions[currentQuestion].id);
    
    if (existingIndex >= 0) {
      newAnswers[existingIndex] = { questionId: questions[currentQuestion].id, value };
    } else {
      newAnswers.push({ questionId: questions[currentQuestion].id, value });
    }
    
    setAnswers(newAnswers);

    if (currentQuestion < questions.length - 1) {
      setTimeout(() => setCurrentQuestion(currentQuestion + 1), 300);
    } else {
      setTimeout(() => setShowResults(true), 300);
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const calculateScores = () => {
    const scores = {
      Depression: 0,
      ADHD: 0,
      Anxiety: 0,
      Sleep: 0
    };

    answers.forEach(answer => {
      const question = questions.find(q => q.id === answer.questionId);
      if (question) {
        scores[question.category as keyof typeof scores] += answer.value;
      }
    });

    return scores;
  };

  const getScoreInterpretation = (score: number, maxScore: number) => {
    const percentage = (score / maxScore) * 100;
    if (percentage < 25) return { level: 'Minimal', color: 'text-green-600', bgColor: 'bg-green-100' };
    if (percentage < 50) return { level: 'Mild', color: 'text-yellow-600', bgColor: 'bg-yellow-100' };
    if (percentage < 75) return { level: 'Moderate', color: 'text-orange-600', bgColor: 'bg-orange-100' };
    return { level: 'Severe', color: 'text-red-600', bgColor: 'bg-red-100' };
  };

  const currentAnswer = answers.find(a => a.questionId === questions[currentQuestion]?.id);

  if (showResults) {
    const scores = calculateScores();
    const categoryMaxScores = {
      Depression: 24,
      ADHD: 16,
      Anxiety: 20,
      Sleep: 4
    };

    return (
      <div className="min-h-screen" style={{ backgroundColor: '#E0EAEA' }}>
        <div className="bg-gradient-to-r from-purple-400 to-purple-500 py-6 px-4 shadow-md">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold text-white font-serif text-center">Your Mental Health Assessment Results</h1>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 font-serif">Assessment Complete!</h2>
            <p className="text-gray-600 mb-8 font-serif">Based on your responses, here are your scores across different categories:</p>

            <div className="space-y-6">
              {Object.entries(scores).map(([category, score]) => {
                const maxScore = categoryMaxScores[category as keyof typeof categoryMaxScores];
                const interpretation = getScoreInterpretation(score, maxScore);
                const percentage = (score / maxScore) * 100;

                return (
                  <div key={category} className="border-b pb-6 last:border-b-0">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-xl font-semibold text-gray-800 font-serif">{category}</h3>
                      <span className={`px-4 py-1 rounded-full text-sm font-semibold ${interpretation.bgColor} ${interpretation.color}`}>
                        {interpretation.level}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1 bg-gray-200 rounded-full h-4 overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-purple-400 to-purple-600 transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="text-gray-700 font-semibold font-serif">{score}/{maxScore}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 p-6 bg-blue-50 rounded-lg border-l-4 border-blue-500">
              <h3 className="text-lg font-bold text-blue-900 mb-2 font-serif">Important Note</h3>
              <p className="text-blue-800 font-serif">
                This screening is not a diagnosis. If you're experiencing significant distress, please consult with a mental health professional for a comprehensive evaluation.
              </p>
            </div>

            <div className="mt-8 flex gap-4">
              <button
                onClick={() => navigate('/patient-dashboard')}
                className="flex-1 bg-gradient-to-r from-purple-500 to-purple-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-purple-600 hover:to-purple-700 transition-all font-serif"
              >
                Back to Dashboard
              </button>
              <button
                onClick={() => {
                  setShowResults(false);
                  setCurrentQuestion(0);
                  setAnswers([]);
                }}
                className="flex-1 bg-white border-2 border-purple-500 text-purple-600 py-3 px-6 rounded-lg font-semibold hover:bg-purple-50 transition-all font-serif"
              >
                Retake Test
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Sidebar */}
      {sidebarOpen && <div className="fixed inset-0 z-40" onClick={() => setSidebarOpen(false)} />}
      <div className={`fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 shadow-lg transform transition-transform duration-300 ease-in-out z-50 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ backgroundColor: '#7DA9A8' }}>
        <div className="h-full flex flex-col p-4 text-white font-serif">
          <div className="space-y-3 mb-6">
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors" onClick={() => navigate('/patient-dashboard')}>
              <span className="text-base font-medium">My Dashboard</span>
            </div>
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors" onClick={() => navigate('/call-history')}>
              <span className="text-base font-medium">My Calls</span>
            </div>
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors" onClick={() => navigate('/pending-tasks')}>
              <span className="text-base font-medium">Pending Tasks</span>
            </div>
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors" onClick={() => navigate('/my-journal')}>
              <span className="text-base font-medium">My Journal</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div>
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

        {/* Test Content */}
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-white">
            {/* Test Title and Avatar */}
            <div className="flex justify-between items-start mb-8">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>Do I have ADHD?</h2>
              <div className="ml-4">
                <img src="/assest02.svg" alt="Avatar" className="h-16 w-16 md:h-20 md:w-20 rounded-full object-cover" />
              </div>
            </div>

            {/* Question Counter */}
            <div className="mb-6">
              <p className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>Question: {currentQuestion + 1}/{questions.length}</p>
            </div>

            {/* Question Text */}
            <div className="mb-8">
              <p className="text-2xl md:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>{questions[currentQuestion].text}</p>
            </div>

            {/* Answer Buttons */}
            <div className="flex flex-wrap gap-3 mb-12">
              {answerOptions.map((option) => (
                <button 
                  key={option.value}
                  onClick={() => handleAnswer(option.value)}
                  className={`py-3 px-6 rounded-full text-base font-semibold transition-all duration-200 border-2 ${
                    currentAnswer?.value === option.value
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-900 border-gray-900 hover:bg-gray-100'
                  }`}
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MentalHealthTestPage;
