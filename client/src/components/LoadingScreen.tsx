import React from 'react';

interface LoadingScreenProps {
  message?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ message = 'Loading...' }) => {
  return (
    <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
      <div className="text-center">
        {/* Animated Logo or Spinner */}
        <div className="mb-6">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-teal-600"></div>
        </div>
        
        {/* Loading Message */}
        <h2 className="text-2xl font-bold text-gray-800 mb-2" style={{ fontFamily: 'Bree Serif, serif' }}>
          {message}
        </h2>
        
        {/* Subtext */}
        <p className="text-gray-600 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
          Please wait while we connect you...
        </p>
        
        {/* Progress Dots */}
        <div className="mt-4 flex justify-center space-x-2">
          <div className="w-2 h-2 bg-teal-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 bg-teal-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 bg-teal-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;
