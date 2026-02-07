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

export default function Reviews() {
  const [reviews, setReviews] = useState<Review[]>([]);

  const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:5001/api'
    : 'https://veraawell-backend.onrender.com/api';

  // Predefined background colors for variety
  const bgColors = [
    "bg-[#A594C4]",
    "bg-[#7BC3E8]",
    "bg-[#9BC49A]",
    "bg-[#F4B87A]",
    "bg-[#E89B9B]",
    "bg-[#B8A9E8]",
    "bg-[#A8D8A8]",
    "bg-[#F4C87A]"
  ];

  useEffect(() => {
    fetchPlatformReviews();
  }, []);

  const fetchPlatformReviews = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/reviews/platform?limit=20`);
      if (!response.ok) throw new Error('Failed to fetch reviews');

      const data = await response.json();
      setReviews(data.reviews || []);
    } catch (error) {
      console.error('Error fetching platform reviews:', error);
      // Keep empty array if fetch fails
    }
  };

  // Fallback to static reviews if no reviews are fetched
  const displayReviews = reviews.length > 0 ? reviews : [
    {
      _id: '1',
      patientId: { firstName: 'Isha', lastName: '' },
      rating: 5,
      feedback: "I came in feeling lost, and today I feel stronger and more in control of my life. Thank you, Veraawell, for your guidance and patience.",
      createdAt: new Date().toISOString()
    },
    {
      _id: '2',
      patientId: { firstName: 'Rahul', lastName: '' },
      rating: 5,
      feedback: "Veraawell has been a game-changer for my mental health journey. The therapists are compassionate and understanding.",
      createdAt: new Date().toISOString()
    },
    {
      _id: '3',
      patientId: { firstName: 'Priya', lastName: '' },
      rating: 4,
      feedback: "The platform is user-friendly and the sessions have helped me develop better coping strategies for stress and anxiety.",
      createdAt: new Date().toISOString()
    }
  ];

  // For scrolling
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const scrollByCard = () => {
    if (!scrollRef.current) return 0;
    const card = scrollRef.current.querySelector('div[data-testimonial-card]');
    return card ? (card as HTMLElement).offsetWidth + 32 : 350; // 32 = gap-8
  };
  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -scrollByCard(), behavior: 'smooth' });
    }
  };
  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: scrollByCard(), behavior: 'smooth' });
    }
  };

  return (
    <section className="w-full bg-[#E0EAEA] py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header with Illustration */}
        <div className="relative flex justify-center mb-16">
          <div className="absolute md:-top-16 left-1/2 transform -translate-x-1/2 z-20 sm:-top-16 ">
            <img
              src="/2453876 1.svg"
              alt="People illustration"
              className="w-80 h-auto mt-3"
            />
          </div>
          <div className="bg-[#C17B5C] rounded-[40px] px-20 py-2 shadow-[0_8px_16px_rgba(0,0,0,0.2)] mt-32 relative z-10">
            <h2 className="text-white text-[36px] font-bold text-center font-serif">
              Reviews
            </h2>
          </div>
        </div>
        {/* Horizontal Scrollable Testimonials */}
        <div className="relative">
          <button
            onClick={scrollLeft}
            className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white rounded-full w-12 h-12 items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50"
            aria-label="Scroll left"
            style={{ transform: 'translate(-50%, -50%)' }}
          >
            <span className="text-[#C17B5C] text-3xl font-bold">&#8249;</span>
          </button>
          <div
            ref={scrollRef}
            className="flex gap-4 sm:gap-6 md:gap-8 overflow-x-auto scroll-smooth pb-4 hide-scrollbar"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
          >
            {displayReviews.map((review, index) => (
              <div
                key={review._id}
                data-testimonial-card
                className={`
                  ${bgColors[index % bgColors.length]}
                  min-w-[85vw] max-w-[95vw] sm:min-w-[340px] sm:max-w-[370px] md:min-w-[320px] md:max-w-[350px]
                  rounded-[10px] border border-[rgba(0,0,0,0.16)] shadow-xl flex flex-col h-full p-5 sm:p-8 flex-shrink-0
                `}
              >
                <h3 className="text-white font-bold text-[22px] sm:text-[26px] md:text-[30px] font-bowlby mb-2 leading-tight">
                  {review.patientId.firstName} {review.patientId.lastName && review.patientId.lastName.charAt(0) + '.'}
                </h3>
                <div className="flex items-center mb-4">
                  {Array.from({ length: 5 }, (_, starIndex) => (
                    <span
                      key={starIndex}
                      className={`text-[24px] sm:text-[28px] md:text-[32px] mr-1 ${starIndex < review.rating ? 'text-[#FFB800]' : 'text-white/40'}`}
                    >
                      ★
                    </span>
                  ))}
                </div>
                <p className="text-white font-bree text-[15px] sm:text-[18px] md:text-[22px] leading-snug">
                  "{review.feedback}"
                </p>
              </div>
            ))}
          </div>
          <button
            onClick={scrollRight}
            className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white rounded-full w-12 h-12 items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50"
            aria-label="Scroll right"
            style={{ transform: 'translate(50%, -50%)' }}
          >
            <span className="text-[#C17B5C] text-3xl font-bold">&#8250;</span>
          </button>
        </div>
      </div>
    </section>
  );
}
