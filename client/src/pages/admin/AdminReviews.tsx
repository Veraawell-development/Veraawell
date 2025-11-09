import React, { useState, useEffect } from 'react';
import { IoStar, IoStarOutline, IoCheckmarkCircle, IoWarning, IoTime } from 'react-icons/io5';

const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:5001/api'
  : 'https://veraawell-backend.onrender.com/api';

interface Review {
  _id: string;
  rating: number;
  feedback: string;
  positives: string;
  improvements: string;
  wouldRecommend: boolean;
  reviewStatus: 'pending' | 'reviewed' | 'flagged';
  patientId: {
    firstName: string;
    lastName: string;
    email: string;
  };
  doctorId: {
    firstName: string;
    lastName: string;
    email: string;
  };
  sessionId: {
    sessionDate: string;
    sessionTime: string;
  };
  createdAt: string;
}

interface DoctorPerformance {
  doctorId: string;
  doctorName: string;
  email: string;
  averageRating: number;
  totalReviews: number;
  fiveStars: number;
  fourStars: number;
  threeStars: number;
  twoStars: number;
  oneStar: number;
  recommendCount: number;
}

const AdminReviews: React.FC = () => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [doctorPerformance, setDoctorPerformance] = useState<DoctorPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'reviews' | 'performance'>('performance');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    reviewed: 0,
    flagged: 0,
    averageRating: 0
  });

  useEffect(() => {
    fetchDoctorPerformance();
    fetchReviews();
  }, [filterStatus]);

  const fetchDoctorPerformance = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/reviews/admin/doctor-performance`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setDoctorPerformance(data);
      }
    } catch (error) {
      console.error('Error fetching doctor performance:', error);
    }
  };

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const statusParam = filterStatus !== 'all' ? `?status=${filterStatus}` : '';
      const response = await fetch(`${API_BASE_URL}/reviews/admin/all${statusParam}`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setReviews(data.reviews);
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateReviewStatus = async (reviewId: string, status: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/reviews/admin/${reviewId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status })
      });

      if (response.ok) {
        fetchReviews();
        alert('Review status updated');
      }
    } catch (error) {
      console.error('Error updating review status:', error);
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          star <= rating ? (
            <IoStar key={star} className="text-yellow-400 text-xl" />
          ) : (
            <IoStarOutline key={star} className="text-gray-300 text-xl" />
          )
        ))}
      </div>
    );
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: { bg: '#FEF3C7', text: '#92400E', icon: IoTime },
      reviewed: { bg: '#D1FAE5', text: '#065F46', icon: IoCheckmarkCircle },
      flagged: { bg: '#FEE2E2', text: '#991B1B', icon: IoWarning }
    };

    const style = styles[status as keyof typeof styles];
    const Icon = style.icon;

    return (
      <span
        className="px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1"
        style={{ backgroundColor: style.bg, color: style.text, fontFamily: 'Inter, sans-serif' }}
      >
        <Icon /> {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Bree Serif, serif' }}>
            Reviews & Performance
          </h1>
          <p className="text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
            Monitor patient feedback and doctor performance metrics
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>Total Reviews</p>
            <p className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>{stats.total}</p>
          </div>
          <div className="bg-yellow-50 rounded-lg shadow p-6">
            <p className="text-sm text-yellow-800 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>Pending</p>
            <p className="text-3xl font-bold text-yellow-900" style={{ fontFamily: 'Bree Serif, serif' }}>{stats.pending}</p>
          </div>
          <div className="bg-green-50 rounded-lg shadow p-6">
            <p className="text-sm text-green-800 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>Reviewed</p>
            <p className="text-3xl font-bold text-green-900" style={{ fontFamily: 'Bree Serif, serif' }}>{stats.reviewed}</p>
          </div>
          <div className="bg-red-50 rounded-lg shadow p-6">
            <p className="text-sm text-red-800 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>Flagged</p>
            <p className="text-3xl font-bold text-red-900" style={{ fontFamily: 'Bree Serif, serif' }}>{stats.flagged}</p>
          </div>
          <div className="bg-blue-50 rounded-lg shadow p-6">
            <p className="text-sm text-blue-800 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>Avg Rating</p>
            <p className="text-3xl font-bold text-blue-900" style={{ fontFamily: 'Bree Serif, serif' }}>{stats.averageRating.toFixed(1)}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setActiveTab('performance')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              activeTab === 'performance'
                ? 'bg-purple-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Doctor Performance
          </button>
          <button
            onClick={() => setActiveTab('reviews')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              activeTab === 'reviews'
                ? 'bg-purple-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            All Reviews
          </button>
        </div>

        {/* Doctor Performance Tab */}
        {activeTab === 'performance' && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead style={{ backgroundColor: '#ABA5D1' }}>
                  <tr>
                    <th className="px-6 py-4 text-left text-white font-semibold" style={{ fontFamily: 'Bree Serif, serif' }}>Doctor</th>
                    <th className="px-6 py-4 text-center text-white font-semibold" style={{ fontFamily: 'Bree Serif, serif' }}>Avg Rating</th>
                    <th className="px-6 py-4 text-center text-white font-semibold" style={{ fontFamily: 'Bree Serif, serif' }}>Total Reviews</th>
                    <th className="px-6 py-4 text-center text-white font-semibold" style={{ fontFamily: 'Bree Serif, serif' }}>5★</th>
                    <th className="px-6 py-4 text-center text-white font-semibold" style={{ fontFamily: 'Bree Serif, serif' }}>4★</th>
                    <th className="px-6 py-4 text-center text-white font-semibold" style={{ fontFamily: 'Bree Serif, serif' }}>3★</th>
                    <th className="px-6 py-4 text-center text-white font-semibold" style={{ fontFamily: 'Bree Serif, serif' }}>2★</th>
                    <th className="px-6 py-4 text-center text-white font-semibold" style={{ fontFamily: 'Bree Serif, serif' }}>1★</th>
                    <th className="px-6 py-4 text-center text-white font-semibold" style={{ fontFamily: 'Bree Serif, serif' }}>Recommend %</th>
                  </tr>
                </thead>
                <tbody>
                  {doctorPerformance.map((doctor, index) => (
                    <tr key={doctor.doctorId} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {doctor.doctorName}
                          </p>
                          <p className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {doctor.email}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center">
                          <span className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>
                            {doctor.averageRating.toFixed(1)}
                          </span>
                          {renderStars(Math.round(doctor.averageRating))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-lg font-semibold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
                          {doctor.totalReviews}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-gray-700" style={{ fontFamily: 'Inter, sans-serif' }}>{doctor.fiveStars}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-gray-700" style={{ fontFamily: 'Inter, sans-serif' }}>{doctor.fourStars}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-gray-700" style={{ fontFamily: 'Inter, sans-serif' }}>{doctor.threeStars}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-gray-700" style={{ fontFamily: 'Inter, sans-serif' }}>{doctor.twoStars}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-gray-700" style={{ fontFamily: 'Inter, sans-serif' }}>{doctor.oneStar}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-lg font-semibold text-green-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                          {doctor.totalReviews > 0 ? Math.round((doctor.recommendCount / doctor.totalReviews) * 100) : 0}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* All Reviews Tab */}
        {activeTab === 'reviews' && (
          <div>
            {/* Filter */}
            <div className="mb-4 flex gap-2">
              {['all', 'pending', 'reviewed', 'flagged'].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    filterStatus === status
                      ? 'bg-purple-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>

            {/* Reviews List */}
            <div className="space-y-4">
              {loading ? (
                <div className="text-center py-12">
                  <p className="text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>Loading reviews...</p>
                </div>
              ) : reviews.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-lg shadow">
                  <p className="text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>No reviews found</p>
                </div>
              ) : (
                reviews.map((review) => (
                  <div key={review._id} className="bg-white rounded-lg shadow p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-2">
                          {renderStars(review.rating)}
                          {getStatusBadge(review.reviewStatus)}
                        </div>
                        <p className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                          Patient: <span className="font-semibold">{review.patientId.firstName} {review.patientId.lastName}</span> →
                          Doctor: <span className="font-semibold">Dr. {review.doctorId.firstName} {review.doctorId.lastName}</span>
                        </p>
                        <p className="text-xs text-gray-500 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                          Session: {new Date(review.sessionId.sessionDate).toLocaleDateString()} at {review.sessionId.sessionTime}
                        </p>
                      </div>
                      <p className="text-sm text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {new Date(review.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-700 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>Feedback:</p>
                        <p className="text-gray-800" style={{ fontFamily: 'Inter, sans-serif' }}>{review.feedback}</p>
                      </div>

                      {review.positives && (
                        <div>
                          <p className="text-sm font-semibold text-green-700 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>What went well:</p>
                          <p className="text-gray-800" style={{ fontFamily: 'Inter, sans-serif' }}>{review.positives}</p>
                        </div>
                      )}

                      {review.improvements && (
                        <div>
                          <p className="text-sm font-semibold text-orange-700 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>Areas for improvement:</p>
                          <p className="text-gray-800" style={{ fontFamily: 'Inter, sans-serif' }}>{review.improvements}</p>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-700" style={{ fontFamily: 'Inter, sans-serif' }}>
                          Would recommend:
                        </span>
                        <span className={`text-sm font-semibold ${review.wouldRecommend ? 'text-green-600' : 'text-red-600'}`} style={{ fontFamily: 'Inter, sans-serif' }}>
                          {review.wouldRecommend ? '✓ Yes' : '✗ No'}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 mt-4 pt-4 border-t">
                      {review.reviewStatus !== 'reviewed' && (
                        <button
                          onClick={() => updateReviewStatus(review._id, 'reviewed')}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                          Mark as Reviewed
                        </button>
                      )}
                      {review.reviewStatus !== 'flagged' && (
                        <button
                          onClick={() => updateReviewStatus(review._id, 'flagged')}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                          Flag Review
                        </button>
                      )}
                      {review.reviewStatus !== 'pending' && (
                        <button
                          onClick={() => updateReviewStatus(review._id, 'pending')}
                          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                          Mark as Pending
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminReviews;
