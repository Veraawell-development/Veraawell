import React, { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '../../../config/api';
import LeafDecor from '../../ui/LeafDecor';

interface Review {
  _id: string;
  rating: number;
  feedback: string;
  patientId: { firstName: string; lastName: string };
  createdAt: string;
}

const fallbackReviews: Review[] = [
  { _id: '1', patientId: { firstName: 'Isha', lastName: 'M.' }, rating: 5, feedback: 'I came in feeling lost, and today I feel stronger and more in control of my life. Thank you, Veraawell, for your guidance and patience.', createdAt: new Date().toISOString() },
  { _id: '2', patientId: { firstName: 'Rahul', lastName: 'V.' }, rating: 5, feedback: 'Veraawell has been a game-changer for my mental health journey. The therapists are compassionate and truly understanding.', createdAt: new Date().toISOString() },
  { _id: '3', patientId: { firstName: 'Priya', lastName: 'S.' }, rating: 4, feedback: 'The platform is user-friendly and the sessions have helped me develop better coping strategies for stress and anxiety.', createdAt: new Date().toISOString() },
  { _id: '4', patientId: { firstName: 'Arjun', lastName: 'K.' }, rating: 5, feedback: 'Finding a therapist felt daunting but Veraawell made it seamless. I feel genuinely heard every session.', createdAt: new Date().toISOString() },
  { _id: '5', patientId: { firstName: 'Sneha', lastName: 'R.' }, rating: 5, feedback: "The progress tracking feature is incredible. Being able to see how far I've come keeps me motivated to continue.", createdAt: new Date().toISOString() },
  { _id: '6', patientId: { firstName: 'Vikram', lastName: 'T.' }, rating: 4, feedback: 'Professional, private, and genuinely helpful. My therapist remembered every detail across sessions.', createdAt: new Date().toISOString() },
];

const avatarColors = ['#7C3AED', '#0D9488', '#C4A882', '#EA580C', '#059669', '#7B5EA7'];

const Stars: React.FC<{ rating: number }> = ({ rating }) => (
  <div className="flex gap-0.5">
    {[...Array(5)].map((_, i) => (
      <span key={i} style={{ color: i < rating ? '#F59E0B' : '#E5E7EB', fontSize: '12px' }}>★</span>
    ))}
  </div>
);

const TestimonialCard: React.FC<{ review: Review; index: number }> = ({ review, index }) => {
  const initial = review.patientId.firstName.charAt(0).toUpperCase();
  const color = avatarColors[index % avatarColors.length];

  return (
    <div
      className="testimonial-card rounded-2xl p-6"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
    >
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '48px', lineHeight: 1, color: '#9B7FE8', opacity: 0.5, marginBottom: '12px', userSelect: 'none' }}>"</div>

      <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>
        {review.feedback}
      </p>

      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ background: color }}>
          {initial}
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            {review.patientId.firstName}{review.patientId.lastName ? ` ${review.patientId.lastName.charAt(0)}.` : ''}
          </p>
          <Stars rating={review.rating} />
        </div>
      </div>
    </div>
  );
};

import { motion, useAnimationFrame, useMotionValue, useSpring, useTransform } from 'framer-motion';

const SmoothMarquee: React.FC<{ items: Review[]; reverse?: boolean }> = ({ items, reverse = false }) => {
  const duplicatedItems = [...items, ...items];
  // Speed in percentage of total width per second. -2 means moving left.
  const baseVelocity = reverse ? 2.5 : -2.5;
  
  const baseX = useMotionValue(0);
  // Damping controls the smoothness of the stop/start (lower damping = more wobble, higher = smoother stop)
  const smoothVelocity = useSpring(baseVelocity, { damping: 40, stiffness: 200 });

  useAnimationFrame((time, delta) => {
    let moveBy = smoothVelocity.get() * (delta / 1000);
    let current = baseX.get() + moveBy;
    
    // Wrap around at 50% since we duplicated the items once.
    if (current <= -50) current += 50;
    if (current > 0) current -= 50;
    
    baseX.set(current);
  });

  const x = useTransform(baseX, (v) => `${v}%`);

  return (
    <div 
      className="overflow-visible w-full py-1"
      onMouseEnter={() => smoothVelocity.set(0)}
      onMouseLeave={() => smoothVelocity.set(baseVelocity)}
      onTouchStart={() => smoothVelocity.set(0)}
      onTouchEnd={() => smoothVelocity.set(baseVelocity)}
    >
      <motion.div style={{ x, display: 'flex', width: 'max-content', gap: '1.5rem', paddingBottom: '0.5rem' }}>
        {duplicatedItems.map((review, i) => (
          <div key={`${review._id}-${i}`} className="w-[85vw] sm:w-[350px] flex-shrink-0">
            <TestimonialCard review={review} index={i} />
          </div>
        ))}
      </motion.div>
    </div>
  );
};

const Reviews: React.FC = () => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerVisible, setHeaderVisible] = useState(false);

  useEffect(() => {
    const fetchReviews = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/reviews/platform?limit=6`);
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        if (data.reviews?.length) setReviews(data.reviews.slice(0, 6));
      } catch { /* use fallback */ }
    };
    fetchReviews();
  }, []);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setHeaderVisible(true); observer.unobserve(el); } },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const displayReviews = reviews.length > 0 ? reviews : fallbackReviews;

  return (
    <section className="section-tinted relative overflow-hidden" style={{ padding: 'clamp(64px, 8vw, 112px) 1rem' }}>
      {/* Decorative Leaves */}
      <LeafDecor
        style={{
          top: '-40px',
          left: '-40px',
          width: '260px',
          height: '260px',
          transform: 'rotate(-25deg)',
          opacity: 0.04,
        }}
      />
      <LeafDecor
        style={{
          bottom: '10%',
          right: '-60px',
          width: '200px',
          height: '200px',
          transform: 'rotate(150deg)',
          opacity: 0.05,
        }}
      />
      
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

        {/* Header */}
        <div
          ref={headerRef}
          className="text-center mb-14"
          style={{
            opacity: headerVisible ? 1 : 0,
            transform: headerVisible ? 'translateY(0)' : 'translateY(24px)',
            transition: 'opacity 0.65s var(--ease-spring), transform 0.65s var(--ease-spring)',
          }}
        >
          <span className="text-xs font-medium tracking-widest uppercase block mb-4" style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>
            — What Our Users Say
          </span>
          <h2 className="leading-tight mx-auto mb-3" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 3.5vw, 48px)', color: 'var(--text)', letterSpacing: '-0.02em', maxWidth: '460px' }}>
            Real stories, <em style={{ color: 'var(--teal)' }}>real impact.</em>
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
            Thousands of people have started their healing journey with Veraawell.
          </p>
        </div>
      </div>

      {/* Marquee Two-Layer - Full Bleed */}
      <div className="marquee-wrapper mt-4">
        <SmoothMarquee items={displayReviews} />
        <SmoothMarquee items={displayReviews} reverse={true} />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Trust signal */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mt-14">
          <div className="flex items-center gap-2">
            {[...Array(5)].map((_, i) => <span key={i} style={{ color: '#F59E0B', fontSize: '16px' }}>★</span>)}
          </div>
          <div className="w-px h-6 hidden sm:block" style={{ background: 'var(--border-strong)' }} />
          <p className="text-sm text-center" style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
            4.8 average rating · 1,000+ verified reviews
          </p>
        </div>

      </div>
    </section>
  );
};

export default Reviews;
