import React from 'react';

const LoadingScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-gray-200 border-t-teal-500 rounded-full animate-spin"></div>
    </div>
  );
};

export default LoadingScreen;
