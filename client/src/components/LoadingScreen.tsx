import React from 'react';

interface LoadingScreenProps {
  message?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ message = 'Loading...' }) => {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-teal-50 via-white to-purple-50 z-50 flex items-center justify-center">
      <div className="text-center px-4">
        {/* Modern Spinner with Gradient */}
        <div className="relative mb-8">
          {/* Outer ring */}
          <div className="w-20 h-20 mx-auto relative">
            <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-teal-500 border-r-purple-400 animate-spin"></div>
          </div>
          
          {/* Inner pulse */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 bg-gradient-to-br from-teal-400 to-purple-400 rounded-full animate-pulse opacity-20"></div>
          </div>
        </div>
        
        {/* Loading Message */}
        <h2 className="text-xl font-semibold text-gray-800 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
          {message}
        </h2>
        
        {/* Animated Progress Bar */}
        <div className="w-48 h-1 mx-auto bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-teal-500 to-purple-500 rounded-full animate-pulse" 
               style={{ 
                 width: '60%',
                 animation: 'slide 1.5s ease-in-out infinite'
               }}>
          </div>
        </div>
        
        <style>{`
          @keyframes slide {
            0% { transform: translateX(-100%); }
            50% { transform: translateX(100%); }
            100% { transform: translateX(-100%); }
          }
        `}</style>
      </div>
    </div>
  );
};

export default LoadingScreen;
