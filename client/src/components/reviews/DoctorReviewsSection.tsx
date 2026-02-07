import React, { useState, useEffect } from 'react';

interface Review {
    _id: string;
    rating: number;
    feedback: string;
    patientId: {
        firstName: string;
        lastName: string;
    };
    createdAt: string;
}

interface ReviewStats {
    averageRating: number;
    totalReviews: number;
    fiveStars: number;
    fourStars: number;
    threeStars: number;
    twoStars: number;
    oneStar: number;
}

interface DoctorReviewsSectionProps {
    doctorId: string;
}

const DoctorReviewsSection: React.FC<DoctorReviewsSectionProps> = ({ doctorId }) => {
    const [reviews, setReviews] = useState<Review[]>([]);
    const [stats, setStats] = useState<ReviewStats | null>(null);
    const [loading, setLoading] = useState(true);

    const API_BASE_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:5001/api'
        : 'https://veraawell-backend.onrender.com/api';

    useEffect(() => {
        fetchDoctorReviews();
    }, [doctorId]);

    const fetchDoctorReviews = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/reviews/doctor/${doctorId}?limit=10`);
            if (!response.ok) throw new Error('Failed to fetch reviews');

            const data = await response.json();
            setReviews(data.reviews || []);
            setStats(data.stats || null);
        } catch (error) {
            console.error('Error fetching doctor reviews:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="py-12 text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#7DA9A8] border-r-transparent"></div>
            </div>
        );
    }

    if (!stats || reviews.length === 0) {
        return (
            <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
                <p className="text-gray-500 text-lg">No reviews yet</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Stats Section */}
            <div className="bg-gradient-to-br from-[#F0F9F9] to-white rounded-2xl shadow-lg p-8 border-2 border-[#7DA9A8]/20">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Average Rating */}
                    <div className="text-center md:border-r md:border-gray-200">
                        <div className="text-5xl font-bold" style={{ color: '#7DA9A8' }}>
                            {stats.averageRating.toFixed(1)}
                        </div>
                        <div className="flex justify-center my-3">
                            {Array.from({ length: 5 }, (_, i) => (
                                <span
                                    key={i}
                                    className={`text-3xl ${i < Math.round(stats.averageRating) ? 'text-[#FFB800]' : 'text-gray-300'}`}
                                >
                                    ★
                                </span>
                            ))}
                        </div>
                        <p className="text-gray-600 font-medium">
                            Based on {stats.totalReviews} review{stats.totalReviews !== 1 && 's'}
                        </p>
                    </div>

                    {/* Rating Distribution */}
                    <div className="space-y-2">
                        {[
                            { stars: 5, count: stats.fiveStars },
                            { stars: 4, count: stats.fourStars },
                            { stars: 3, count: stats.threeStars },
                            { stars: 2, count: stats.twoStars },
                            { stars: 1, count: stats.oneStar }
                        ].map(({ stars, count }) => (
                            <div key={stars} className="flex items-center gap-3">
                                <span className="text-sm font-medium text-gray-700 w-8">{stars}★</span>
                                <div className="flex-1 bg-gray-200 rounded-full h-2.5">
                                    <div
                                        className="h-2.5 rounded-full"
                                        style={{
                                            width: `${stats.totalReviews > 0 ? (count / stats.totalReviews) * 100 : 0}%`,
                                            backgroundColor: '#7DA9A8'
                                        }}
                                    ></div>
                                </div>
                                <span className="text-sm text-gray-600 w-8">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Reviews List */}
            <div className="space-y-4">
                {reviews.map((review) => (
                    <div
                        key={review._id}
                        className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow p-6 border border-gray-100"
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <h4 className="font-semibold text-lg text-gray-900">
                                    {review.patientId.firstName} {review.patientId.lastName && review.patientId.lastName.charAt(0) + '.'}
                                </h4>
                                <div className="flex items-center gap-2 mt-1">
                                    {Array.from({ length: 5 }, (_, i) => (
                                        <span
                                            key={i}
                                            className={`text-xl ${i < review.rating ? 'text-[#FFB800]' : 'text-gray-300'}`}
                                        >
                                            ★
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <span className="text-sm text-gray-500">
                                {new Date(review.createdAt).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                })}
                            </span>
                        </div>
                        <p className="text-gray-700 leading-relaxed">{review.feedback}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default DoctorReviewsSection;
