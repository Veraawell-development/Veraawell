import HeroSection from '../components/landing/hero/HeroSection';
import FeaturesSection from '../components/landing/features/FeaturesSection';
import AboutSection from '../components/landing/about/WhatIsVeraawell';
import HowItWorks from '../components/landing/howitworks/HowItWorks';
import MissionStats from '../components/landing/statistics/MissionStats';
import TherapistPreview from '../components/landing/therapists/TherapistPreview';
import Reviews from '../components/landing/testimonials/Reviews';
import CTABanner from '../components/landing/cta/CTABanner';
import { Helmet } from 'react-helmet-async';

export default function LandingPage() {
  return (
    <div style={{ overflowX: 'hidden' }}>
      <Helmet>
        <title>Veraawell - Professional Mental Health Care in India</title>
        <meta name="description" content="Connect with India's top therapists and psychologists. Progress tracking, on-demand sessions, and flexible pricing. Start your mental health journey today." />
        <meta property="og:title" content="Veraawell — Professional Mental Health Care in India" />
        <meta property="og:description" content="Connect with India's top therapists. Sessions on your schedule, progress tracked." />
      </Helmet>
      {/* 1. Hero — cream bg, typographic headline, floating app card */}
      <HeroSection />

      {/* 2. Features — bento grid, 5 colored feature cards */}
      <FeaturesSection />

      {/* 3. About — who we are, linked CTA, stat panel */}
      <AboutSection />

      {/* 4. How It Works — 3-step process with animated connectors */}
      <HowItWorks />

      {/* 5. Mission + Stats — animated CountUp, mission statement */}
      <MissionStats />

      {/* 6. Therapist Preview — 3 placeholder cards, navigates to /choose-professional */}
      <TherapistPreview />

      {/* 7. Testimonials — masonry 3-column grid, live reviews with fallback */}
      <Reviews />

      {/* 8. Dark CTA Banner — conversion section before footer */}
      <CTABanner />
    </div>
  );
}