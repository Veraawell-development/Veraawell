import HeroSection from '../components/HeroSection';
import FeaturesSection from '../components/landing/features';
import WhatIsVeraawell from '../components/landing/about';
import MissionStats from '../components/landing/statistics';
import Reviews from '../components/landing/testimonials';

export default function LandingPage() {
  return (
    <div style={{overflowX:'hidden'}}>

      <HeroSection />
      <FeaturesSection />
      <WhatIsVeraawell />
      <MissionStats />
      <Reviews />
    </div>
  );
} 