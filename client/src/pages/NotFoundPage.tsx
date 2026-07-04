import React from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';

const NotFoundPage: React.FC = () => {
    return (
        <div className="h-[calc(100vh-80px)] bg-[#FAFAFA] font-sans flex items-center justify-center p-4">
            <div className="text-center max-w-md w-full">
                {/* Visual Element */}
                <div className="relative mb-6 flex justify-center">
                    <div className="w-24 h-24 bg-teal-50 rounded-[2rem] rotate-12 flex items-center justify-center border border-teal-100 shadow-sm">
                        <div className="w-24 h-24 bg-white rounded-[2rem] -rotate-12 absolute flex items-center justify-center border border-gray-100 shadow-sm">
                            <span className="text-4xl font-black text-teal-600 tracking-tighter" style={{ fontFamily: 'Inter, sans-serif' }}>404</span>
                        </div>
                    </div>
                </div>
                
                {/* Text Content */}
                <h1 className="text-[28px] font-extrabold text-gray-900 mb-2 tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Page Not Found
                </h1>
                
                <p className="text-[15px] text-gray-500 mb-8 font-medium leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Oops! The page you are looking for doesn't exist or has been moved. Let's get you back to safety.
                </p>
                
                {/* Action Button */}
                <Link
                    to="/"
                    className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 transition-colors shadow-sm text-[14px]"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                >
                    <FiArrowLeft className="w-4 h-4" />
                    Back to Home
                </Link>
            </div>
        </div>
    );
};

export default NotFoundPage;
