import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface BackToDashboardProps {
    className?: string;
}

const BackToDashboard: React.FC<BackToDashboardProps> = ({ className = "" }) => {
    const navigate = useNavigate();
    const { user } = useAuth();

    const handleBack = () => {
        if (user?.role === 'doctor') {
            navigate('/doctor-dashboard');
        } else {
            navigate('/patient-dashboard');
        }
    };

    return (
        <button
            onClick={handleBack}
            className={`flex items-center gap-2 group transition-all duration-200 hover:gap-3 mb-6 ${className}`}
            style={{ fontFamily: 'Inter, sans-serif' }}
        >
            <div className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center group-hover:bg-black/10 transition-colors">
                <svg
                    className="w-4 h-4 text-current"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M10 19l-7-7m0 0l7-7m-7 7h18"
                    />
                </svg>
            </div>
            <span className="text-sm font-semibold uppercase tracking-wider opacity-70 group-hover:opacity-100">
                Back to Dashboard
            </span>
        </button>
    );
};

export default BackToDashboard;
