import React from 'react';
import { Link } from 'react-router-dom';

const NotFoundPage: React.FC = () => {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-black text-white p-4">
            <div className="text-center max-w-lg">
                <div className="relative mb-8">
                    <h1 className="text-9xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-500 opacity-20">
                        404
                    </h1>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-4xl font-bold" style={{ fontFamily: 'Bree Serif, serif' }}>Page Not Found</span>
                    </div>
                </div>
                
                <p className="text-gray-400 text-lg mb-8 font-light" style={{ fontFamily: 'Inter, sans-serif' }}>
                    The path you are looking for does not exist or has been moved. Let's get you back on track.
                </p>
                
                <Link
                    to="/"
                    className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-semibold rounded-full hover:shadow-lg hover:shadow-cyan-500/20 transition-all transform hover:-translate-y-0.5"
                    style={{ fontFamily: 'Bree Serif, serif' }}
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to Home
                </Link>
            </div>
        </div>
    );
};

export default NotFoundPage;
