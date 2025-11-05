import React, { useState, useEffect } from 'react';
import { FiPhone, FiDownload } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

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

  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5001/api' 
    : 'https://veraawell-backend.onrender.com/api';

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

  const handleDownloadReceipt = (callId: string) => {
    // TODO: Implement receipt download functionality
    console.log('Downloading receipt for call:', callId);
    alert('Receipt download functionality will be implemented soon!');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#E0EAEA' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-serif">Loading call history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#E0EAEA' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#ABA5D1' }}>
        <div className="px-6 py-4 flex items-center justify-center relative">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-6 text-white hover:text-gray-200"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Bree Serif, serif' }}>Call History</h1>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-8 max-w-4xl mx-auto">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {callHistory.length === 0 ? (
          <div className="text-center py-16">
            <FiPhone className="mx-auto text-6xl text-gray-400 mb-4" />
            <p className="text-xl text-gray-600" style={{ fontFamily: 'Bree Serif, serif' }}>No call history yet</p>
            <p className="text-gray-500 mt-2" style={{ fontFamily: 'Bree Serif, serif' }}>Your completed and cancelled sessions will appear here</p>
          </div>
        ) : (
          <div className="space-y-5">
            {callHistory.map((call) => (
              <div
                key={call._id}
                className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-shadow"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Column */}
                  <div className="space-y-2">
                    <div>
                      <p className="text-base font-bold" style={{ fontFamily: 'Bree Serif, serif', color: '#000000' }}>
                        Name: <span className="font-semibold">{call.name}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-base font-bold" style={{ fontFamily: 'Bree Serif, serif', color: '#000000' }}>
                        Date: <span className="font-semibold">{formatDate(call.date)}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-base font-bold" style={{ fontFamily: 'Bree Serif, serif', color: '#000000' }}>
                        Mode: <span className={`font-semibold ${getModeColor(call.mode)}`}>{call.mode}</span>
                      </p>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-2 md:text-right">
                    <div>
                      <p className="text-base font-bold" style={{ fontFamily: 'Bree Serif, serif', color: '#000000' }}>
                        Duration: <span className="font-semibold">{call.duration} minutes</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-base font-bold" style={{ fontFamily: 'Bree Serif, serif', color: '#000000' }}>
                        Payment Amount: <span className="font-semibold">Rs.{call.paymentAmount}</span>
                      </p>
                    </div>
                    <div className="mt-3">
                      <button
                        onClick={() => handleDownloadReceipt(call._id)}
                        className="inline-flex items-center gap-2 px-6 py-2 rounded-full font-bold text-base transition-all shadow-md hover:shadow-lg"
                        style={{ 
                          backgroundColor: '#FFFFFF',
                          color: '#000000',
                          fontFamily: 'Bree Serif, serif',
                          border: '2px solid #E0E0E0'
                        }}
                      >
                        <FiDownload className="text-lg" />
                        Download Receipt
                      </button>
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
