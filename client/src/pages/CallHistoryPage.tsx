import React, { useState, useEffect } from 'react';
import { FiPhone } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import BackToDashboard from '../components/BackToDashboard';
import { API_BASE_URL } from '../config/api';

interface CallRecord {
  _id: string;
  name: string;
  date: string;
  duration: number;
  mode: 'Video Calling' | 'Voice Calling' | 'Cancelled & Refunded';
  paymentAmount: number;
  paymentStatus: string;
  sessionType: string;
  status: string;
}

const CallHistoryPage: React.FC = () => {
  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCallHistory();
  }, []);

  const fetchCallHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/sessions/call-history`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Please log in to view call history');
        }
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.message || `HTTP ${response.status}: Failed to fetch call history`);
      }

      const data = await response.json();
      setCallHistory(data);
    } catch (error: any) {
      console.error('Error fetching call history:', error);
      if (error.message.includes('Failed to fetch') || error.message.includes('ERR_CONNECTION_REFUSED')) {
        setError('Cannot connect to server. Please make sure the backend is running on port 5001.');
      } else {
        setError(error.message || 'Failed to load call history');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleString('en-US', { month: 'long' });
    const year = date.getFullYear();

    const suffix = (day: number) => {
      if (day > 3 && day < 21) return 'th';
      switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
      }
    };

    return `${day}${suffix(day)} ${month},${year}`;
  };

  const getModeColor = (mode: string) => {
    if (mode === 'Cancelled & Refunded') return 'text-red-600';
    if (mode === 'Voice Calling') return 'text-purple-600';
    return 'text-green-600';
  };



  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] font-sans">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7DA9A8] mx-auto"></div>
          <p className="mt-4 text-gray-500 text-sm">Loading call history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] font-sans">
      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="px-6 py-4 flex items-center justify-between max-w-4xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-800">Call History</h1>
          <div className="w-6"></div> {/* Spacer for centering */}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-8 max-w-4xl mx-auto">
        <BackToDashboard />
        
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-lg text-sm mb-6">
            {error}
          </div>
        )}

        {callHistory.length === 0 ? (
          <div className="text-center py-16">
            <FiPhone className="mx-auto text-5xl text-gray-300 mb-4" />
            <p className="text-lg font-semibold text-gray-600">No call history yet</p>
            <p className="text-sm text-gray-500 mt-1">Your completed and cancelled sessions will appear here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {callHistory.map((call) => (
              <div
                key={call._id}
                className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-sm transition-shadow"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Column */}
                  <div className="grid grid-cols-3 md:grid-cols-1 gap-2 md:gap-1 text-sm">
                    <div>
                      <p className="text-xs text-gray-400">Name</p>
                      <p className="font-semibold text-gray-800">{call.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Date</p>
                      <p className="font-medium text-gray-700">{formatDate(call.date)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Mode</p>
                      <p className={`font-medium ${getModeColor(call.mode)}`}>{call.mode}</p>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="grid grid-cols-2 md:grid-cols-1 gap-2 md:gap-1 text-sm md:text-right">
                    <div>
                      <p className="text-xs text-gray-400">Duration</p>
                      <p className="font-medium text-gray-700">{call.duration} minutes</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Payment Amount</p>
                      <p className="font-semibold text-gray-800">Rs.{call.paymentAmount}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CallHistoryPage;
